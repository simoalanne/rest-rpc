import type { HttpMethod, RouteDefinition } from "@rest-rpc/core/contract";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type { IncomingMessage, ServerResponse } from "node:http";
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
import {
	createRequestSignal,
	nodeRequestReader,
	readRequestTarget,
} from "./request.ts";
import { fromFetchResponse } from "../pipeline/rawResponse.ts";
import { writeNodeResponse, writeNodeResult } from "./response.ts";

/** A Node route, its definition, and whether it was completed with `.static()`. */
export type CompiledNodeRoute = NodeRoute<object> & {
	isStatic: boolean;
	definition: RouteDefinition;
};

const nodeResponseWriter: ResponseWriter<ServerResponse, void> = {
	result: (result, response, codecs) =>
		writeNodeResult(response, result, codecs),
	error: (parts, response) => writeNodeResponse(response, parts),
};

/** Compiles a route tree into Node routes, for the handlers of this runtime. */
export const compileNodeRoutes = (
	implementations: RuntimeImplementationTree,
	options: CreateRouteHandlersOptions<IncomingMessage>,
): CompiledNodeRoute[] => {
	const { routes, dispatch } = compileRouteTree(
		implementations,
		options,
		nodeRequestReader,
		nodeResponseWriter,
	);
	return routes.map(
		({
			method,
			path,
			definition,
			implementation,
			pathParams,
			staticResponse,
		}): CompiledNodeRoute => {
			if (staticResponse) {
				return {
					method,
					path,
					definition,
					isStatic: true,
					handle: (_request, response) =>
						writeNodeResponse(
							response,
							staticResponse instanceof Response
								? fromFetchResponse(staticResponse.clone())
								: staticResponse,
						),
				};
			}
			return {
				method,
				path,
				definition,
				isStatic: false,
				handle: (request, response, ...[handleOptions]) =>
					dispatch(
						implementation,
						pathParams,
						request,
						response,
						createRequestSignal(response),
						handleOptions,
					),
			};
		},
	);
};

/**
 * A Node route handler ready to be registered on a router.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export type NodeRoute<TContext extends object = EmptyObject> = {
	readonly method: HttpMethod;
	/** Route path with `:name` params. */
	readonly path: string;
	/**
	 * Handles a request already routed to this route and writes the result,
	 * including streams, to `response`. Params are used from `options`, then
	 * from `request.params` when a router such as Express sets it, and are
	 * otherwise read from the request URL.
	 */
	readonly handle: (
		request: IncomingMessage,
		response: ServerResponse,
		...options: OptionsArgs<TContext, HandleOptions<TContext>>
	) => Promise<void>;
};

/**
 * Indicates whether the Node HTTP catch-all handler dispatched a request to a rest-rpc route.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export type NodeRouteHandlerResult = { matched: boolean };

/**
 * Creates one Node route handler per method and path of a route tree, to
 * register on a router.
 *
 * @remarks Use {@link createCatchAllHandler} to let rest-rpc do the routing
 * instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#native-router}
 */
export function createRouteHandlers<TRoutes extends RuntimeImplementationTree>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions<IncomingMessage> = {},
): NodeRoute<TreeInitialContext<TRoutes>>[] {
	return compileNodeRoutes(implementations, options).map(
		({ method, path, handle }) => ({ method, path, handle }),
	) as NodeRoute<TreeInitialContext<TRoutes>>[];
}

/**
 * Creates a Node HTTP catch-all handler that routes requests to the routes of
 * a route tree.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler<
	TRoutes extends RuntimeImplementationTree,
>(
	implementations: TRoutes,
	options: CreateRouteHandlersOptions<IncomingMessage> = {},
): (
	request: IncomingMessage,
	response: ServerResponse,
	...options: OptionsArgs<
		TreeInitialContext<TRoutes>,
		CatchAllHandleOptions<TreeInitialContext<TRoutes>>
	>
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(
		compileNodeRoutes(implementations, options),
	);

	return async (request, response, ...[handleOptions]) => {
		const match = matchRoute(
			request.method ?? "GET",
			readRequestTarget(request),
			handleOptions?.mountPath,
		);
		if (!match) {
			return { matched: false };
		}

		// Unless the caller passes params, the matched ones are passed on, so they
		// are not parsed from the URL again.
		const { route, params } = match;
		await route.handle(
			request,
			response,
			params && !handleOptions?.params
				? { ...handleOptions, params }
				: handleOptions,
		);
		return { matched: true };
	};
}
