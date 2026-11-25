import type { HttpMethod } from "@rest-rpc/core/contract";
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
import { RouteError, type InterceptedRoute } from "@rest-rpc/core";
import {
	intercept,
	writeErrorResponse,
	type NodeInterceptor,
} from "./interceptor.ts";

/** A Node route, its definition, and whether it was completed with `.static()`. */
export type CompiledNodeRoute = NodeRoute<object> & {
	isStatic: boolean;
	definition: InterceptedRoute;
};

const nodeResponseWriter: ResponseWriter<ServerResponse, void> = {
	result: (result, response, codecs) =>
		writeNodeResult(response, result, codecs),
};

/** Compiles a route tree into Node routes, for the handlers of this runtime. */
export const compileNodeRoutes = (
	router: RuntimeImplementationTree,
	options: CreateRouteHandlersOptions,
): CompiledNodeRoute[] => {
	const { routes, dispatch } = compileRouteTree(
		router,
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
 * A Node route handler ready to be registered on a framework's router.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#route-handlers}
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
 * Customizes the routes, request parsing and interceptors of Node route
 * handlers and the catch-all handler.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#errors-and-interceptors}
 */
export type NodeRouteHandlersOptions = CreateRouteHandlersOptions & {
	/**
	 * Functions around each route's `handle`, the first outermost. They run
	 * after the framework routed the request, so `route` is always defined.
	 */
	interceptors?: readonly NodeInterceptor[];
};

// Route errors are written as error responses, and other thrown values reject
// for the framework's error handling. Static routes skip interceptors, as in
// `createApp`.
const toNodeRoutes = (
	router: RuntimeImplementationTree,
	{ interceptors, ...options }: NodeRouteHandlersOptions,
): CompiledNodeRoute[] =>
	compileNodeRoutes(router, options).map((route) => {
		if (route.isStatic) return route;
		const { definition, handle } = route;
		return {
			...route,
			handle: (request, response, ...handleOptions) =>
				(interceptors?.length
					? intercept(interceptors, request, response, definition, () =>
							handle(request, response, ...handleOptions),
						)
					: handle(request, response, ...handleOptions)
				).catch((error: unknown) => {
					if (error instanceof RouteError && !response.headersSent) {
						return writeErrorResponse(response, error);
					}
					throw error;
				}),
		};
	});

/**
 * Creates one Node route handler per method and path of a route tree, to
 * register on a framework's router.
 *
 * @remarks `handle` writes `RouteError`s as error responses, and rejects with
 * other thrown values, for the framework's error handling. Use
 * {@link createCatchAllHandler} to let rest-rpc do the routing instead.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#route-handlers}
 */
export function createRouteHandlers<TRouter extends RuntimeImplementationTree>(
	router: TRouter,
	options: NodeRouteHandlersOptions = {},
): NodeRoute<TreeInitialContext<TRouter>>[] {
	return toNodeRoutes(router, options).map(({ method, path, handle }) => ({
		method,
		path,
		handle,
	})) as NodeRoute<TreeInitialContext<TRouter>>[];
}

/**
 * Creates a Node HTTP catch-all handler that routes requests to the routes of
 * a route tree.
 *
 * @remarks Unmatched requests are left untouched and reported with
 * `matched: false` so the surrounding server can provide fallback routing,
 * and interceptors only run for matched requests. Errors are handled as by
 * the `handle` of {@link createRouteHandlers}.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/framework-integration#catch-all-handler}
 */
export function createCatchAllHandler<
	TRouter extends RuntimeImplementationTree,
>(
	router: TRouter,
	options: NodeRouteHandlersOptions = {},
): (
	request: IncomingMessage,
	response: ServerResponse,
	...options: OptionsArgs<
		TreeInitialContext<TRouter>,
		CatchAllHandleOptions<TreeInitialContext<TRouter>>
	>
) => Promise<NodeRouteHandlerResult> {
	const matchRoute = createRouteMatcher(toNodeRoutes(router, options));

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
