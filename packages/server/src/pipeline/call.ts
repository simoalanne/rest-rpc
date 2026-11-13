import {
	RouteError,
	type ClientPromise,
	type FetchOptions,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
} from "@rest-rpc/core";
import { normalizeMediaType } from "@rest-rpc/core/codecs";
import { markDefined, type RouteDefinition } from "@rest-rpc/core/contract";
import type { InitialContextOf } from "../builder/routeBuilder.types.ts";
import type { ContextOption, OptionsArgs } from "./compileRoutes.ts";
import {
	isImplementedRoute,
	toRuntimeImplementation,
	type ImplementedRoute,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import { executeRoute, type RouteResult } from "./handleHttpRoute.ts";
import { resolveRouteError } from "./resolveRouteError.ts";
import { toSseEvent } from "./sse.ts";

/** Options accepted by `call`. `context` is required when the route requires initial context. */
export type CallOptions<TRoute extends ImplementedRoute> = Pick<
	FetchOptions,
	"signal"
> &
	ContextOption<InitialContextOf<TRoute["~restrpc"]>>;

type CallArgs<TRoute extends ImplementedRoute> = [
	InferClientRequest<TRoute>,
] extends [undefined]
	? object extends InitialContextOf<TRoute["~restrpc"]>
		? [request?: undefined, options?: CallOptions<TRoute>]
		: [request: undefined, options: CallOptions<TRoute>]
	: [
			request: InferClientRequest<TRoute>,
			...OptionsArgs<InitialContextOf<TRoute["~restrpc"]>, CallOptions<TRoute>>,
		];

const toSseEvents = async function* (stream: AsyncIterable<unknown>) {
	for await (const item of stream) yield toSseEvent(item);
};

// Mirrors the fetch client, which reports the received base media type.
const toCallResult = ({
	status,
	headers = {},
	cookies = [],
	body,
}: RouteResult) => ({
	status,
	contentType:
		body &&
		("stream" in body
			? "text/event-stream"
			: normalizeMediaType(body.contentType)),
	headers,
	cookies,
	body: body && ("stream" in body ? toSseEvents(body.stream) : body.value),
});

/** The promise a local call returns, which carries the errors it rejects with. */
type CallResult<TRoute extends ImplementedRoute> = ClientPromise<
	InferClientResponse<TRoute>,
	InferClientError<TRoute> | Error
>;

// Mirrors the fetch client: the error that would be sent is received, and
// marked as defined when the route defines its code.
const toClientError = async (route: RouteDefinition, error: RouteError) => {
	const resolved = await resolveRouteError(route, error, false);
	return route.errors && Object.hasOwn(route.errors, resolved.code)
		? markDefined(resolved)
		: resolved;
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
 * provide. Rejects like the fetch client: with the `RouteError` that would be
 * sent, marked as defined when the route defines its code. Other errors
 * thrown by the handler reject unchanged.
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

/** The client returned by `createLocalClient`. */
export type LocalClient<T extends RuntimeImplementationTree> =
	T extends ImplementedRoute
		? (...args: CallArgs<T>) => CallResult<T>
		: {
				[
					K in keyof T as T[K] extends RuntimeImplementationTree ? K : never
				]: LocalClient<Extract<T[K], RuntimeImplementationTree>>;
			};

const buildLocalClient = (tree: RuntimeImplementationTree): unknown =>
	isImplementedRoute(tree)
		? (...args: CallArgs<typeof tree>) => call(tree, ...args)
		: Object.fromEntries(
				Object.entries(tree).map(([key, child]) => [
					key,
					buildLocalClient(child),
				]),
			);

/**
 * Creates a local client for a route tree, whose leaves call their route
 * handlers with `call`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/local-client#local-client}
 */
export function createLocalClient<const T extends RuntimeImplementationTree>(
	routes: T,
): LocalClient<T> {
	return buildLocalClient(routes) as LocalClient<T>;
}
