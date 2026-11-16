import type { HttpMethod, RouteDefinition } from "@rest-rpc/core/contract";
import type { EmptyObject } from "@rest-rpc/core/utils";
import { compileRouteTree, type ResponseWriter } from "../pipeline/dispatch.ts";
import type {
	CatchAllHandleOptions,
	CreateRouteHandlersOptions,
	HandleOptions,
	OptionsArgs,
} from "../pipeline/handleOptions.ts";
import {
	createRouteMatcher,
	type RuntimeImplementationTree,
	type TreeInitialContext,
} from "../routing/match.ts";
import { fetchRequestReader } from "./request.ts";
import {
	serializeFetchError,
	serializeFetchResult,
	toFetchResponse,
	withoutBody,
} from "./response.ts";

/**
 * Result of dispatching a request with the Fetch catch-all handler.
 *
 * @remarks `matched` is `false` when no route matches, so the surrounding
 * runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export type FetchRouteHandlerResult =
	| { matched: true; response: Response }
	| { matched: false; response: undefined };

/**
 * A compiled route ready to be registered on a router.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export type FetchRoute<TContext extends object = EmptyObject> = {
	readonly method: HttpMethod;
	/** Route path with `:name` params. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route. Params and the body are
	 * read from the request unless passed in `options`.
	 */
	readonly handle: (
		request: Request,
		...options: OptionsArgs<TContext, HandleOptions<TContext>>
	) => Promise<Response>;
	/**
	 * The response of a route completed with `.static()`, for routers that
	 * serve a `Response` as is. It is `undefined` for other routes.
	 *
	 * @remarks It is the same object for every request, so call `handle` to
	 * send the response in other ways.
	 */
	readonly staticResponse?: Response;
};

const fetchResponseWriter: ResponseWriter<undefined, Response> = {
	result: (result, _target, codecs) => serializeFetchResult(result, codecs),
	error: serializeFetchError,
};

/**
 * Creates one Fetch route handler per method and path of a route tree, to
 * register on a router.
 *
 * @remarks Use {@link createCatchAllHandler} to let rest-rpc do the routing
 * instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export function createRouteHandlers<TRoutes extends RuntimeImplementationTree>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions = {},
): FetchRoute<TreeInitialContext<TRoutes>>[] {
	return compileFetchRoutes(implementations, options);
}

/** A Fetch route with its definition, for the interceptors of an app. */
export type CompiledFetchRoute = FetchRoute<object> & {
	definition: RouteDefinition;
};

/** Compiles a route tree into Fetch routes with their definitions. */
export const compileFetchRoutes = (
	implementations: RuntimeImplementationTree,
	options: CreateRouteHandlersOptions,
): CompiledFetchRoute[] => {
	const { routes, dispatch } = compileRouteTree(
		implementations,
		options,
		fetchRequestReader,
		fetchResponseWriter,
	);

	return routes.map(
		({
			method,
			path,
			definition,
			implementation,
			pathParams,
			staticResponse,
		}): CompiledFetchRoute => {
			if (staticResponse) {
				const createResponse = () =>
					staticResponse instanceof Response
						? staticResponse.clone()
						: toFetchResponse(staticResponse);
				return {
					method,
					path,
					definition,
					handle: async (request: Request, ..._options: unknown[]) =>
						request.method === "HEAD"
							? withoutBody(createResponse())
							: createResponse(),
					staticResponse: createResponse(),
				};
			}
			return {
				method,
				path,
				definition,
				handle: (request, ...[handleOptions]) => {
					const response = dispatch(
						implementation,
						pathParams,
						request,
						undefined,
						request.signal,
						handleOptions,
					);
					// A `HEAD` request runs the `GET` route, and is sent without the body.
					return request.method === "HEAD"
						? response.then(withoutBody)
						: response;
				},
			};
		},
	);
};

/**
 * Creates a Fetch catch-all handler that routes requests to the routes of a
 * route tree.
 *
 * @remarks An unmatched request is returned to the caller with `matched: false`
 * so the surrounding runtime can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler<
	TRoutes extends RuntimeImplementationTree,
>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions = {},
): (
	request: Request,
	...options: OptionsArgs<
		TreeInitialContext<TRoutes>,
		CatchAllHandleOptions<TreeInitialContext<TRoutes>>
	>
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(
		createRouteHandlers<RuntimeImplementationTree>(implementations, options),
	);

	return async (request, ...[handleOptions]) => {
		const match = matchRoute(
			request.method,
			request.url,
			handleOptions?.mountPath,
		);
		if (!match) {
			return { matched: false, response: undefined };
		}

		// Unless the caller passes params, the matched ones are passed on, so they
		// are not parsed from the URL again and params another router attached to
		// the request are ignored.
		const { route, params } = match;
		return {
			matched: true,
			response: await route.handle(
				request,
				params && !handleOptions?.params
					? { ...handleOptions, params }
					: handleOptions,
			),
		};
	};
}
