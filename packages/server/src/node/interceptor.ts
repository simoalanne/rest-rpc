import type { InterceptedRoute, RouteError } from "@rest-rpc/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { writeNodeError } from "./response.ts";

/**
 * A function around everything a Node app does for a request, for work
 * before routing or on every response, such as API key checks, logging, or
 * CORS headers and preflights.
 *
 * @remarks It receives every request, including ones that match no route,
 * except those a route completed with `.static()` serves. `next()` continues
 * with the app and resolves once the response is written, streams included,
 * for every `RouteError` too. It rejects only with other thrown values, such
 * as an `Error` a handler throws, unchanged, and with stream failures. Headers
 * set on `response` before `next()` are sent with every response, and an
 * interceptor that writes its own response does not call `next()`. Errors
 * that reach the app are sent as `INTERNAL_SERVER_ERROR` responses, or close
 * the connection when the response already started, and so does finishing
 * without a response.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#interceptors}
 */
export type NodeInterceptor = (args: {
	request: IncomingMessage;
	response: ServerResponse;
	/**
	 * The matched route's definition, with its path without the mount path and
	 * its `meta`, or `undefined` when no route matches the request.
	 */
	route: InterceptedRoute | undefined;
	/**
	 * Handles the request with the later interceptors and the app. Resolves
	 * for every `RouteError`, and rejects with other thrown values.
	 */
	next: () => Promise<void>;
}) => void | Promise<void>;

/**
 * Types a Node interceptor, to pass in `interceptors` to the Node
 * `createApp`. It returns the function unchanged.
 *
 * @example
 * ```ts
 * const apiKey = interceptor(({ request, response, next }) => {
 * 	if (request.headers["x-api-key"] === env.API_KEY) return next();
 * 	response.writeHead(403).end("Forbidden");
 * });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#interceptors}
 */
export function interceptor(interceptor: NodeInterceptor): NodeInterceptor {
	return interceptor;
}

/** Handles a request through the interceptors in order, the first outermost. */
export const intercept = (
	interceptors: readonly NodeInterceptor[],
	request: IncomingMessage,
	response: ServerResponse,
	route: InterceptedRoute | undefined,
	handle: () => Promise<void>,
): Promise<void> => {
	const run = async (index: number): Promise<void> => {
		const interceptor = interceptors[index];
		if (!interceptor) return handle();
		return interceptor({
			request,
			response,
			route,
			next: () => run(index + 1),
		});
	};
	return run(0);
};

/**
 * Writes the response the app sends for a `RouteError`: its status and
 * headers, and a JSON `{ code, message, data? }` body. Clients decode it as a
 * `RouteError`, so an interceptor can send an error they handle like any
 * other.
 *
 * @remarks No route definition applies, so the error is sent with its own
 * status, `data` and headers, without validation.
 *
 * @example
 * ```ts
 * const RateLimited = routeError("RATE_LIMITED", { status: 429 });
 *
 * const rateLimit = interceptor(({ request, response, next }) =>
 * 	limiter.allow(request)
 * 		? next()
 * 		: writeErrorResponse(response, new RateLimited()),
 * );
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#error-responses}
 */
export function writeErrorResponse(
	response: ServerResponse,
	error: RouteError,
): Promise<void> {
	return writeNodeError(response, error);
}
