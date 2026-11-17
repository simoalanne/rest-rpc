import type { AbsolutePath } from "@rest-rpc/core";
import type { EmptyObject } from "@rest-rpc/core/utils";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NotFound } from "../pipeline/errors.ts";
import type { CreateRouteHandlersOptions } from "../pipeline/handleOptions.ts";
import {
	createRouteMatcher,
	type RuntimeImplementationTree,
	type TreeInitialContext,
} from "../routing/match.ts";
import { compileNodeRoutes } from "./createRouteHandlers.ts";
import { readRequestTarget } from "./request.ts";
import {
	intercept,
	writeErrorResponse,
	type NodeInterceptor,
} from "./interceptor.ts";

/**
 * The `context` option of the Node {@link createApp}: the initial context, or
 * a function that returns it for a request.
 */
export type NodeAppContext<TContext extends object> =
	| TContext
	| ((request: IncomingMessage) => TContext | Promise<TContext>);

/**
 * Customizes the routes, request parsing and interceptors of a Node app.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#app-options}
 */
export type CreateNodeAppOptions<TContext extends object = EmptyObject> =
	CreateRouteHandlersOptions & {
		/**
		 * The path the routes are served under, such as `/api`. Route paths do
		 * not include it.
		 */
		mountPath?: AbsolutePath;
		/**
		 * Functions around everything the app does for a request, the first
		 * outermost. They run before routing.
		 */
		interceptors?: readonly NodeInterceptor[];
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
 * @remarks Errors no interceptor catches are written as
 * `writeErrorResponse()` writes them: `RouteError`s as error responses, and
 * other thrown values, such as errors thrown by handlers, as
 * `INTERNAL_SERVER_ERROR` responses with the thrown value as `cause`. They
 * close the connection instead when the response already started. Use {@link createRouteHandlers} and
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
	const { mountPath, context, interceptors, ...routeOptions } = options ?? {};
	const matchRoute = createRouteMatcher(
		compileNodeRoutes(implementations, routeOptions),
	);

	const serve = async (
		request: IncomingMessage,
		response: ServerResponse,
		match: ReturnType<typeof matchRoute>,
	) => {
		// `NOT_FOUND` rejects like other errors, so interceptors observe it.
		if (!match) throw new NotFound();
		const { route, params } = match;
		// Static routes read no context, so the context function is not called.
		const values =
			route.isStatic || typeof context !== "function"
				? context
				: await context(request);
		await route.handle(request, response, { context: values, params });
	};

	return async (request, response) => {
		try {
			const match = matchRoute(
				request.method ?? "GET",
				readRequestTarget(request),
				mountPath,
			);
			// Static routes are sent as they are.
			if (!interceptors?.length || match?.route.isStatic) {
				await serve(request, response, match);
				return;
			}
			await intercept(
				interceptors,
				request,
				response,
				match?.route.definition,
				() => serve(request, response, match),
			);
			// An interceptor that caught an error, or skipped `next()`, may have
			// written nothing, which would leave the request open.
			if (!response.headersSent && !response.destroyed) {
				throw new Error("The interceptors finished without a response.");
			}
		} catch (error) {
			// A started response cannot change its status, so it is cut short.
			if (response.headersSent) response.destroy();
			else
				await writeErrorResponse(response, error).catch(() =>
					response.destroy(),
				);
		}
	};
}
