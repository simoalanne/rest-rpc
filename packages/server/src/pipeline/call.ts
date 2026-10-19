import type {
	FetchOptionsFor,
	InferClientRequest,
	InferClientResponse,
} from "@rest-rpc/core";
import type { ContextOf } from "../builder/routeBuilder.types.ts";
import {
	isImplementedRoute,
	type ImplementedRoute,
	type RuntimeImplementation,
	type RuntimeImplementationTree,
} from "../routing/match.ts";
import { executeRoute, type RouteResult } from "./handleHttpRoute.ts";
import { toSseEvent } from "./sse.ts";

/** Options accepted by `call`. */
export type CallOptions<TRoute extends ImplementedRoute> = Partial<
	Pick<FetchOptionsFor<TRoute["~restrpc"]>, "signal" | "contentType">
> & {
	lastEventId?: string;
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

const toCallResult = ({ status, headers = {}, body }: RouteResult) => ({
	status,
	headers,
	body: body && ("stream" in body ? toSseEvents(body.stream) : body.value),
});

/**
 * Calls a route handler locally, without HTTP serialization.
 *
 * @remarks options can be used to provide values HTTP request would normally provide.
 *
 * @see {@link https://rest-rpc.dev/docs/client/local-client#one-off-calls}
 */
export async function call<TRoute extends ImplementedRoute>(
	route: TRoute,
	...[request, options = {}]: CallArgs<TRoute>
): Promise<InferClientResponse<TRoute>> {
	const { handler, middleware, ...declaration } = route["~restrpc"];
	const { signal, contentType, lastEventId, context } =
		options as CallOptions<ImplementedRoute>;
	const result = await executeRoute(
		{
			route: declaration as RuntimeImplementation["route"],
			handler,
			middleware,
		},
		{
			request: request ?? {},
			signal: signal ?? new AbortController().signal,
			contentType,
			lastEventId,
			context,
		},
	);
	return toCallResult(result) as InferClientResponse<TRoute>;
}

/** The client returned by `initLocalClient`. */
export type LocalClient<T extends RuntimeImplementationTree> =
	T extends ImplementedRoute
		? (...args: CallArgs<T>) => Promise<InferClientResponse<T>>
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
 * @see {@link https://rest-rpc.dev/docs/client/local-client#local-client}
 */
export function initLocalClient<const T extends RuntimeImplementationTree>(
	routes: T,
): LocalClient<T> {
	return createLocalClient(routes) as LocalClient<T>;
}
