import type { HttpMethod } from "@rest-rpc/core/contract";
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
import { RouteError, type InterceptedRoute } from "@rest-rpc/core";
import { errorResponse, intercept, type Interceptor } from "./interceptor.ts";
import {
	respondTo,
	serializeFetchResult,
	toFetchResponse,
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
 * A compiled route ready to be registered on a framework's router.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#route-handlers}
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
};

/**
 * Customizes the routes, request parsing and interceptors of Fetch route
 * handlers and the catch-all handler.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#errors-and-interceptors}
 */
export type FetchRouteHandlersOptions = CreateRouteHandlersOptions & {
	/**
	 * Functions around each route's `handle`, the first outermost. They run
	 * after the framework routed the request, so `route` is always defined,
	 * and `args` is empty.
	 */
	interceptors?: readonly Interceptor[];
};

/**
 * Creates one Fetch route handler per method and path of a route tree, to
 * register on a framework's router.
 *
 * @remarks `handle` sends `RouteError`s as error responses, and rejects with
 * other thrown values, for the framework's error handling. Use
 * {@link createCatchAllHandler} to let rest-rpc do the routing instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#route-handlers}
 */
export function createRouteHandlers<TRouter extends RuntimeImplementationTree>(
	router: TRouter,
	options: FetchRouteHandlersOptions = {},
): FetchRoute<TreeInitialContext<TRouter>>[] {
	const { interceptors, ...compileOptions } = options;
	return compileFetchRoutes(router, compileOptions).map(
		({ method, path, definition, handle, staticResponse }) => ({
			method,
			path,
			staticResponse,
			// Static routes skip interceptors, as in `createApp`.
			handle: (request, ...handleOptions) =>
				respondTo(
					request,
					staticResponse !== undefined
						? handle(request, ...handleOptions)
						: (interceptors?.length
								? intercept(interceptors, request, definition, [], (current) =>
										handle(current, ...handleOptions),
									)
								: handle(request, ...handleOptions)
							).catch((error: unknown) => {
								if (error instanceof RouteError) return errorResponse(error);
								throw error;
							}),
				),
		}),
	);
}

/** A Fetch route with its definition, for the interceptors of an app. */
export type CompiledFetchRoute = FetchRoute<object> & {
	definition: InterceptedRoute;
};

/** Compiles a route tree into Fetch routes with their definitions. */
export const compileFetchRoutes = (
	router: RuntimeImplementationTree,
	options: CreateRouteHandlersOptions,
): CompiledFetchRoute[] => {
	const { routes, dispatch } = compileRouteTree(
		router,
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
					handle: async (_request: Request, ..._options: unknown[]) =>
						createResponse(),
					staticResponse: createResponse(),
				};
			}
			return {
				method,
				path,
				definition,
				handle: (request, ...[handleOptions]) =>
					dispatch(
						implementation,
						pathParams,
						request,
						undefined,
						request.signal,
						handleOptions,
					),
			};
		},
	);
};

/**
 * Creates a Fetch catch-all handler that routes requests to the routes of a
 * route tree.
 *
 * @remarks An unmatched request is returned to the caller with `matched: false`
 * so the surrounding runtime can provide fallback routing, and interceptors
 * only run for matched requests. Errors are handled as by the `handle` of
 * {@link createRouteHandlers}.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler<
	TRouter extends RuntimeImplementationTree,
>(
	router: TRouter,
	options: FetchRouteHandlersOptions = {},
): (
	request: Request,
	...options: OptionsArgs<
		TreeInitialContext<TRouter>,
		CatchAllHandleOptions<TreeInitialContext<TRouter>>
	>
) => Promise<FetchRouteHandlerResult> {
	const matchRoute = createRouteMatcher(
		createRouteHandlers<RuntimeImplementationTree>(router, options),
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
