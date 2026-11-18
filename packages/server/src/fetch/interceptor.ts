import type { InterceptedRoute } from "@rest-rpc/core";
import { asRouteError } from "../pipeline/resolveRouteError.ts";
import { serializeRouteErrorParts } from "../pipeline/serializeHttpRouteResult.ts";
import { toFetchResponse } from "./response.ts";

/**
 * A function around everything a Fetch app does for a request, for work
 * before the route runs or on every response, such as API key checks, logging, or
 * CORS headers and preflights.
 *
 * @remarks It receives every request, including ones that match no route,
 * except those a route completed with `.static()` serves. `next()` continues
 * with the request, and `next(request)` with another one for the matched
 * route to read, such as with other headers. Routing is not repeated, so the
 * URL and method must stay the same. `next()` resolves with the response,
 * before its body streams, and rejects with every error thrown after it:
 * `RouteError`s with the status, `data` and headers they are sent with, such
 * as validation failures and `NOT_FOUND`, and other values unchanged. An
 * interceptor sends an error by throwing it. The app sends what reaches it
 * with {@link errorResponse}.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/interceptors}
 */
export type Interceptor = (args: {
	request: Request;
	/**
	 * The matched route's definition, with its path without the mount path and
	 * its `meta`, or `undefined` when no route matches the request. A request
	 * passed to `next` keeps the route.
	 */
	route: InterceptedRoute | undefined;
	/**
	 * The arguments the runtime passed to `fetch` after the request, such as
	 * the `env` of Cloudflare Workers, as the `context` function receives them.
	 * They are not typed, so narrow them where they are read, such as with
	 * `const [env] = args as [Env]`. Route handlers pass none.
	 */
	args: readonly unknown[];
	/**
	 * Handles `request`, or the given request, with the later interceptors and
	 * the app. Rejects with every error thrown after this interceptor.
	 */
	next: (request?: Request) => Promise<Response>;
}) => Response | Promise<Response>;

/**
 * Types an interceptor, to pass in `interceptors` to `createApp`. It returns
 * the function unchanged.
 *
 * @example
 * ```ts
 * const Forbidden = routeError("FORBIDDEN", { status: 403 });
 *
 * const apiKey = interceptor(({ request, next }) => {
 * 	if (request.headers.get("x-api-key") !== env.API_KEY) throw new Forbidden();
 * 	return next();
 * });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/interceptors}
 */
export function interceptor(interceptor: Interceptor): Interceptor {
	return interceptor;
}

/** Handles a request through the interceptors in order, the first outermost. */
export const intercept = (
	interceptors: readonly Interceptor[],
	request: Request,
	route: InterceptedRoute | undefined,
	args: readonly unknown[],
	handle: (request: Request) => Promise<Response>,
): Promise<Response> => {
	const run = async (index: number, current: Request): Promise<Response> => {
		const interceptor = interceptors[index];
		if (!interceptor) return handle(current);
		return interceptor({
			request: current,
			route,
			args,
			next: (next = current) => run(index + 1, next),
		});
	};
	return run(0, request);
};

/**
 * Creates the response the app sends for a thrown value: a `RouteError` with
 * its status and headers and a JSON `{ code, message, data? }` body, and
 * anything else as an `INTERNAL_SERVER_ERROR` with the value as `cause`.
 * Clients decode it as a `RouteError`.
 *
 * @remarks An interceptor that catches with it turns errors into responses
 * for the interceptors before it, such as to add CORS headers to error
 * responses. A `RouteError` thrown outside a route is sent with its own
 * status, `data` and headers, without validation.
 *
 * @example
 * ```ts
 * createApp(routes, {
 * 	interceptors: [
 * 		cors, // receives error responses too
 * 		interceptor(({ next }) => next().catch(errorResponse)),
 * 		onError((error) => logger.error(error)),
 * 	],
 * });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/interceptors#sending-errors}
 */
export function errorResponse(error: unknown): Response {
	return toFetchResponse(serializeRouteErrorParts(asRouteError(error)));
}

/**
 * Creates an interceptor that calls `callback` with every error thrown after
 * it, then rethrows the error. This includes response bodies that fail while
 * they stream, after `next()` resolved. A client that cancels a body is not
 * reported.
 *
 * @remarks Interceptors after one that turns errors into responses, such as
 * with {@link errorResponse}, receive errors as responses, so place it after
 * them.
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
 * @see {@link https://rest-rpc.vercel.app/docs/server/interceptors#reporting-errors}
 */
export function onError(
	callback: (
		error: unknown,
		args: Parameters<Interceptor>[0],
	) => void | Promise<void>,
): Interceptor {
	return async (args) => {
		let response: Response;
		try {
			response = await args.next();
		} catch (error) {
			await callback(error, args);
			throw error;
		}
		if (!response.body) return response;
		const reader = response.body.getReader();
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				let chunk: Awaited<ReturnType<typeof reader.read>>;
				try {
					chunk = await reader.read();
				} catch (error) {
					controller.error(error);
					await callback(error, args);
					return;
				}
				if (chunk.done) controller.close();
				else controller.enqueue(chunk.value);
			},
			cancel: (reason) => reader.cancel(reason),
		});
		return new Response(body, response);
	};
}
