import type { InterceptedRoute } from "@rest-rpc/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { asRouteError } from "../pipeline/resolveRouteError.ts";
import { serializeRouteErrorParts } from "../pipeline/serializeHttpRouteResult.ts";
import { writeNodeResponse } from "./response.ts";

/**
 * A function around everything a Node app does for a request, for work
 * before routing or on every response, such as API key checks, logging, or
 * CORS headers and preflights.
 *
 * @remarks It receives every request, including ones that match no route,
 * except those a route completed with `.static()` serves. `next()` continues
 * with the app and resolves once the response is written, streams included.
 * It rejects with every error thrown after it: `RouteError`s with the status,
 * `data` and headers they are sent with, such as validation failures and
 * `NOT_FOUND`, other values unchanged, and stream failures. An interceptor
 * sends an error by throwing it. Headers set on `response` before `next()`
 * are sent with every response, and an interceptor that writes its own
 * response does not call `next()`. The app sends what reaches it with
 * {@link writeErrorResponse}, or closes the connection when the response
 * already started, and finishing without a response is an error.
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
	 * Handles the request with the later interceptors and the app. Rejects
	 * with every error thrown after this interceptor.
	 */
	next: () => Promise<void>;
}) => void | Promise<void>;

/**
 * Types a Node interceptor, to pass in `interceptors` to the Node
 * `createApp`. It returns the function unchanged.
 *
 * @example
 * ```ts
 * const Forbidden = routeError("FORBIDDEN", { status: 403 });
 *
 * const apiKey = interceptor(({ request, next }) => {
 * 	if (request.headers["x-api-key"] !== env.API_KEY) throw new Forbidden();
 * 	return next();
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
 * Writes the response the app sends for a thrown value: a `RouteError` with
 * its status and headers and a JSON `{ code, message, data? }` body, and
 * anything else as an `INTERNAL_SERVER_ERROR` with the value as `cause`.
 * Clients decode it as a `RouteError`.
 *
 * @remarks An interceptor that catches with it turns errors into responses
 * for the interceptors before it. A `RouteError` thrown outside a route is
 * sent with its own status, `data` and headers, without validation. A
 * response that already started can't become an error response, so check
 * `response.headersSent` first.
 *
 * @example
 * ```ts
 * const sendErrors = interceptor(({ response, next }) =>
 * 	next().catch((error) => {
 * 		if (response.headersSent) throw error;
 * 		return writeErrorResponse(response, error);
 * 	}),
 * );
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#error-responses}
 */
export function writeErrorResponse(
	response: ServerResponse,
	error: unknown,
): Promise<void> {
	return writeNodeResponse(
		response,
		serializeRouteErrorParts(asRouteError(error)),
	);
}

/**
 * Creates an interceptor that calls `callback` with every error thrown after
 * it, stream failures included, then rethrows the error.
 *
 * @remarks Interceptors after one that turns errors into responses, such as
 * with {@link writeErrorResponse}, receive no errors, so place it after them.
 *
 * @example
 * ```ts
 * createApp(routes, {
 * 	interceptors: [
 * 		onError((error, { request }) => logger.error(error, request.url)),
 * 	],
 * });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/node#reporting-errors}
 */
export function onError(
	callback: (
		error: unknown,
		args: Parameters<NodeInterceptor>[0],
	) => void | Promise<void>,
): NodeInterceptor {
	return async (args) => {
		try {
			await args.next();
		} catch (error) {
			await callback(error, args);
			throw error;
		}
	};
}
