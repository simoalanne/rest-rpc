import type { InterceptedRoute } from "@rest-rpc/core";

/**
 * A function around everything a Fetch app does for a request, for work
 * before routing or on every response, such as API key checks, logging, or
 * CORS headers and preflights.
 *
 * @remarks It receives every request, including ones that match no route,
 * except those a route completed with `.static()` serves. `next()` continues
 * with the request, and `next(request)` with another one, which is routed
 * again. It may be called more than once, such as to retry. It resolves with
 * the final response, error responses included. Errors it throws are sent
 * as `INTERNAL_SERVER_ERROR` responses.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#interceptors}
 */
export type Interceptor = (args: {
	request: Request;
	/**
	 * The matched route's definition, with its path without the mount path and
	 * its `meta`, or `undefined` when no route matches the request. A request
	 * passed to `next` keeps the route of the original request.
	 */
	route: InterceptedRoute | undefined;
	/** Handles `request`, or the given request, with the later interceptors and the app. */
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
	handle: (request: Request) => Promise<Response>,
): Promise<Response> => {
	const run = async (index: number, current: Request): Promise<Response> => {
		const interceptor = interceptors[index];
		if (!interceptor) return handle(current);
		return interceptor({
			request: current,
			route,
			next: (next = current) => run(index + 1, next),
		});
	};
	return run(0, request);
};
