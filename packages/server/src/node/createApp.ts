import type { AbsolutePath } from "@rest-rpc/core";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	InternalServerError,
	NotFound,
	observeError,
} from "../pipeline/errors.ts";
import type { CreateRouteHandlersOptions } from "../pipeline/handleOptions.ts";
import {
	createRouteMatcher,
	type RuntimeImplementationTree,
	type TreeInitialContext,
} from "../routing/match.ts";
import { compileNodeRoutes } from "./createRouteHandlers.ts";
import { readRequestTarget } from "./request.ts";
import { writeNodeError } from "./response.ts";

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
			await writeNodeError(response, new NotFound());
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
				await writeNodeError(response, internal).catch(() =>
					response.destroy(),
				);
		}
	};
}
