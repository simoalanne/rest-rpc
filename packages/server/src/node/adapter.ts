import { RouteError, type AbsolutePath } from "@rest-rpc/core";
import type { HttpMethod } from "@rest-rpc/core/contract";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
	CatchAllHandleOptions,
	CreateRouteHandlersOptions,
	HandleOptions,
	OptionsArgs,
} from "../pipeline/createRouteHandlers.ts";
import { compileRouteTree } from "../pipeline/dispatch.ts";
import {
	InternalServerError,
	NotFound,
	observeError,
} from "../pipeline/errors.ts";
import {
	serializeHttpResponseParts,
	serializeRouteErrorParts,
} from "../pipeline/serializeHttpRouteResult.ts";
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
import {
	createNodeHeaders,
	createStaticWriter,
	writeNodeResponse,
} from "./response.ts";

type CompiledNodeRoute = NodeRoute<object> & { isStatic: boolean };

const writeRouteError = (response: ServerResponse, error: RouteError) =>
	writeNodeResponse(
		response,
		serializeRouteErrorParts(error, createNodeHeaders),
	);

const compileNodeRoutes = (
	implementations: RuntimeImplementationTree,
	options: CreateRouteHandlersOptions<IncomingMessage>,
): CompiledNodeRoute[] => {
	const { routes, dispatch, codecs } = compileRouteTree(
		implementations,
		options,
		nodeRequestReader,
		createNodeHeaders,
	);
	return routes.map(
		({ method, path, implementation, pathParams, staticResponse }) => {
			if (staticResponse) {
				const write = createStaticWriter(staticResponse);
				return {
					method,
					path,
					isStatic: true,
					handle: (_request, response) => write(response),
				};
			}
			return {
				method,
				path,
				isStatic: false,
				handle: async (request, response, ...[handleOptions]) => {
					const result = await dispatch(
						implementation,
						pathParams,
						request,
						createRequestSignal(response),
						handleOptions,
					);
					await (result instanceof RouteError
						? writeRouteError(response, result)
						: writeNodeResponse(
								response,
								await serializeHttpResponseParts(
									result,
									codecs,
									createNodeHeaders,
								),
							));
				},
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

/**
 * The `context` option of the Node {@link createApp}: the initial context, or
 * a function that returns it for a request.
 */
export type NodeAppContext<TContext extends object> =
	| TContext
	| ((request: IncomingMessage) => TContext | Promise<TContext>);

/**
 * Customizes the routes, not found responses, request parsing and error
 * observation of a Node app.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#app-options}
 */
export type CreateNodeAppOptions<TContext extends object = EmptyObject> =
	CreateRouteHandlersOptions<IncomingMessage> & {
		/**
		 * The path the routes are served under, such as `/api`. Route paths do
		 * not include it.
		 */
		mountPath?: AbsolutePath;
		/**
		 * Writes the response for requests that match no route. When it writes
		 * nothing, the default response is sent.
		 *
		 * @default A `NOT_FOUND` error response.
		 */
		notFound?: (
			request: IncomingMessage,
			response: ServerResponse,
		) => void | Promise<void>;
		/**
		 * The initial context the routes require for each request, or a function
		 * that returns it for the request. Required when the routes require
		 * initial context.
		 */
		context?: NodeAppContext<TContext>;
	};

/**
 * A Node request listener that serves a route tree, to pass to
 * `http.createServer()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#usage}
 */
export type NodeApp = (
	request: IncomingMessage,
	response: ServerResponse,
) => Promise<void>;

/**
 * Creates a Node request listener that serves a route tree.
 *
 * @remarks Errors that are not sent as error responses by the routes, such as
 * errors thrown by handlers, are sent as `INTERNAL_SERVER_ERROR` responses
 * with the thrown error as `cause`, or close the connection when the response
 * already started. Use {@link createRouteHandlers} and
 * {@link createCatchAllHandler} instead to serve the routes from a framework.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#usage}
 */
export function createApp<
	TRoutes extends RuntimeImplementationTree<EmptyObject>,
>(
	implementations: TRoutes,
	options?: CreateNodeAppOptions<TreeInitialContext<TRoutes>>,
): NodeApp;
/**
 * Creates a Node request listener that serves a route tree whose routes
 * require initial context, so `context` is required.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#usage}
 */
export function createApp<TRoutes extends RuntimeImplementationTree>(
	implementations: TRoutes,
	options: CreateNodeAppOptions<TreeInitialContext<TRoutes>> & {
		context: NodeAppContext<TreeInitialContext<TRoutes>>;
	},
): NodeApp;
export function createApp(
	implementations: RuntimeImplementationTree,
	options?: CreateNodeAppOptions<object>,
): NodeApp {
	const { mountPath, context, notFound, ...routeOptions } = options ?? {};
	const matchRoute = createRouteMatcher(
		compileNodeRoutes(implementations, routeOptions),
	);
	const respondWithNotFound = async (
		request: IncomingMessage,
		response: ServerResponse,
	) => {
		await notFound?.(request, response);
		if (!response.headersSent && !response.writableEnded) {
			await writeRouteError(response, new NotFound());
		}
	};

	return async (request, response) => {
		try {
			const match = matchRoute(
				request.method ?? "GET",
				readRequestTarget(request),
				mountPath,
			);
			if (!match) return await respondWithNotFound(request, response);
			const { route, params } = match;
			// Static routes read no context, so the context function is not called.
			const values =
				route.isStatic || typeof context !== "function"
					? context
					: await context(request);
			await route.handle(request, response, { context: values, params });
		} catch (error) {
			const internal = new InternalServerError({ cause: error });
			observeError(routeOptions.onError, internal, request);
			// A started response cannot change its status, so it is cut short.
			if (response.headersSent) response.destroy();
			else
				await writeRouteError(response, internal).catch(() =>
					response.destroy(),
				);
		}
	};
}
