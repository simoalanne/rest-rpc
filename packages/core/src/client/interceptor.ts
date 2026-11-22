import type {
	AbsolutePath,
	DefaultMeta,
	RouteDefinition,
} from "../contract/routeDefinition.ts";

/**
 * The route an interceptor receives, with its path resolved from the route
 * tree. Routes may have no meta, so each key of {@link DefaultMeta} is
 * optional.
 */
export type InterceptedRoute = RouteDefinition & {
	path: AbsolutePath;
	meta?: Partial<DefaultMeta>;
};

/**
 * A function around each HTTP exchange of a client, for logging, retries or
 * refreshing credentials. It returns the response the call reads.
 *
 * @remarks `next()` sends the request with `fetch`, or the client's `fetch`
 * option, and `next(request)` sends another one. It may be called more than
 * once, such as to retry, and a request with a body must then be cloned
 * before each send but the last. The response is not decoded yet, so error
 * responses arrive too.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#interceptors}
 */
export type ClientInterceptor = (args: {
	/** The request to send, with the call's signal. */
	request: Request;
	/** Sends `request`, or the given request, through the later interceptors. */
	next: (request?: Request) => Promise<Response>;
	/** The definition of the called route, including its `meta`. */
	route: InterceptedRoute;
}) => Response | Promise<Response>;

/**
 * Types a client interceptor, to pass in `interceptors` to `createClient`. It
 * returns the function unchanged.
 *
 * @example
 * ```ts
 * const logging = clientInterceptor(async ({ request, next }) => {
 * 	const response = await next();
 * 	console.log(request.method, request.url, response.status);
 * 	return response;
 * });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/fetch-client#interceptors}
 */
export function clientInterceptor(
	interceptor: ClientInterceptor,
): ClientInterceptor {
	return interceptor;
}

/** Sends a request through the interceptors in order, the first outermost. */
export const intercept = (
	interceptors: readonly ClientInterceptor[],
	route: InterceptedRoute,
	request: Request,
	send: (request: Request) => Promise<Response>,
): Promise<Response> => {
	const run = async (index: number, current: Request): Promise<Response> => {
		const interceptor = interceptors[index];
		if (!interceptor) return send(current);
		return interceptor({
			request: current,
			next: (next = current) => run(index + 1, next),
			route,
		});
	};
	return run(0, request);
};
