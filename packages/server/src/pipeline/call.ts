import {
	RouteError,
	type ClientPromise,
	type FetchOptions,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
} from "@rest-rpc/core";
import { normalizeMediaType } from "@rest-rpc/core/codecs";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import type { ContextOf } from "../builder/routeBuilder.types.ts";
import {
	isImplementedRoute,
	toRuntimeImplementation,
	type ImplementedRoute,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import { executeRoute, type RouteResult } from "./handleHttpRoute.ts";
import { errorBody, resolveRouteError } from "./resolveRouteError.ts";
import { toSseEvent } from "./sse.ts";

/** Options accepted by `call`. */
export type CallOptions<TRoute extends ImplementedRoute> = Pick<
	FetchOptions,
	"signal"
> & {
	context?: Partial<ContextOf<TRoute["~restrpc"]>>;
};

type CallArgs<TRoute extends ImplementedRoute> = [
	InferClientRequest<TRoute>,
] extends [undefined]
	? [request?: undefined, options?: CallOptions<TRoute>]
	: [request: InferClientRequest<TRoute>, options?: CallOptions<TRoute>];

const toSseEvents = async function* (stream: AsyncIterable<unknown>) {
	for await (const item of stream) yield toSseEvent(item);
};

// Mirrors the fetch client, which reports the received base media type.
const toCallResult = ({ status, headers = {}, body }: RouteResult) => ({
	status,
	contentType:
		body &&
		("stream" in body
			? "text/event-stream"
			: normalizeMediaType(body.contentType)),
	headers,
	body: body && ("stream" in body ? toSseEvents(body.stream) : body.value),
});

/** The promise a local call returns, which carries the errors it rejects with. */
type CallResult<TRoute extends ImplementedRoute> = ClientPromise<
	InferClientResponse<TRoute>,
	InferClientError<TRoute> | Error
>;

// Mirrors the fetch client: errors the route declares are received as is,
// and other error responses become unknown errors.
const toClientError = async (route: RouteDeclaration, error: RouteError) => {
	const resolved = await resolveRouteError(route, error, false);
	if (route.errors && Object.hasOwn(route.errors, resolved.code)) {
		return resolved;
	}
	return new RouteError("UNKNOWN_ERROR", {
		status: resolved.status,
		message: resolved.message,
		data: errorBody(resolved),
		headers: resolved.headers,
		cause: resolved,
	});
};

const callRoute = async (
	route: ImplementedRoute,
	request: unknown,
	options: CallOptions<ImplementedRoute>,
) => {
	const implementation = toRuntimeImplementation(route["~restrpc"]);
	const { signal, context } = options;
	const { contentType } = (request ?? {}) as { contentType?: string };
	// Routes without a body schema have no request media type.
	const mediaType =
		implementation.route.request?.body &&
		(normalizeMediaType(contentType) || implementation.defaultBodyMediaType);
	try {
		const result = await executeRoute(implementation, {
			request: request ?? {},
			signal: signal ?? new AbortController().signal,
			mediaType,
			context,
		});
		return toCallResult(result);
	} catch (error) {
		throw error instanceof RouteError
			? await toClientError(implementation.route, error)
			: error;
	}
};

/**
 * Calls a route handler locally, without HTTP serialization.
 *
 * @remarks options can be used to provide values HTTP request would normally
 * provide. Rejects like the fetch client: with the route's declared errors,
 * with `UNKNOWN_ERROR` for other error responses, and with other errors
 * thrown by the handler unchanged.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/local-client#one-off-calls}
 */
export function call<TRoute extends ImplementedRoute>(
	route: TRoute,
	...[request, options = {}]: CallArgs<TRoute>
): CallResult<TRoute> {
	return callRoute(
		route,
		request,
		options as CallOptions<ImplementedRoute>,
	) as CallResult<TRoute>;
}

/** The client returned by `initLocalClient`. */
export type LocalClient<T extends RuntimeImplementationTree> =
	T extends ImplementedRoute
		? (...args: CallArgs<T>) => CallResult<T>
		: {
				[
					K in keyof T as T[K] extends RuntimeImplementationTree ? K : never
				]: LocalClient<Extract<T[K], RuntimeImplementationTree>>;
			};

const createLocalClient = (tree: RuntimeImplementationTree): unknown =>
	isImplementedRoute(tree)
		? (...args: CallArgs<typeof tree>) => call(tree, ...args)
		: Object.fromEntries(
				Object.entries(tree).map(([key, child]) => [
					key,
					createLocalClient(child),
				]),
			);

/**
 * Creates a local client for a route tree, whose leaves call their route
 * handlers with `call`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/local-client#local-client}
 */
export function initLocalClient<const T extends RuntimeImplementationTree>(
	routes: T,
): LocalClient<T> {
	return createLocalClient(routes) as LocalClient<T>;
}
