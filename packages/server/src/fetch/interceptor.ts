import type { InterceptedRoute, RouteError } from "@rest-rpc/core";
import { serializeFetchError } from "./response.ts";

/**
 * A function around everything a Fetch app does for a request, for work
 * before routing or on every response, such as API key checks, logging, or
 * CORS headers and preflights.
 *
 * @remarks It receives every request, including ones that match no route,
 * except those a route completed with `.static()` serves. `next()` continues
 * with the request, and `next(request)` with another one for the matched
 * route to read, such as with other headers. Routing is not repeated, so the
 * URL and method must stay the same. `next()` resolves with the response,
 * before its body streams, for every `RouteError` too, such as validation
 * failures and the errors routes throw. It rejects only with other thrown
 * values, such as an `Error` a handler, middleware or the `context` function
 * throws, unchanged. Those, and errors an interceptor throws, are sent as
 * `INTERNAL_SERVER_ERROR` responses.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#interceptors}
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
	 * `const [env] = args as [Env]`.
	 */
	args: readonly unknown[];
	/**
	 * Handles `request`, or the given request, with the later interceptors and
	 * the app. Resolves for every `RouteError`, and rejects with other thrown
	 * values.
	 */
	next: (request?: Request) => Promise<Response>;
}) => Response | Promise<Response>;

/**
 * Types an interceptor, to pass in `interceptors` to `createApp`. It returns
 * the function unchanged.
 *
 * @example
 * ```ts
 * const apiKey = interceptor(({ request, next }) =>
 * 	request.headers.get("x-api-key") === env.API_KEY
 * 		? next()
 * 		: new Response("Forbidden", { status: 403 }),
 * );
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#interceptors}
 */
export function interceptor(interceptor: Interceptor): Interceptor {
	return interceptor;
}

/** Handles a request through the interceptors in order, the first outermost. */
export const intercept = (
	interceptors: readonly Interceptor[],
	request: Request,
	route: InterceptedRoute | undefined,
	args: unknown[],
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
 * Creates the response the app sends for a `RouteError`: its status and
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
 * const rateLimit = interceptor(({ request, next }) =>
 * 	limiter.allow(request) ? next() : errorResponse(new RateLimited()),
 * );
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#error-responses}
 */
export function errorResponse(error: RouteError): Response {
	return serializeFetchError(error);
}
