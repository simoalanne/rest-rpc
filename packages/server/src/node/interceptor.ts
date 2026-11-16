import type { InterceptedRoute } from "@rest-rpc/core";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * A function around everything a Node app does for a request, for work
 * before routing or on every response, such as API key checks, logging, or
 * CORS headers and preflights.
 *
 * @remarks It receives every request, including ones that match no route,
 * except those a route completed with `.static()` serves. `next()` continues with the app and resolves once
 * the response is written. Headers set on `response` before `next()` are
 * sent with every response, and an interceptor that writes its own response
 * does not call `next()`. Errors it throws are sent as
 * `INTERNAL_SERVER_ERROR` responses.
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
	/** Handles the request with the later interceptors and the app. */
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
