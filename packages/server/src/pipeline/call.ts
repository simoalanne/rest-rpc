import {
	RouteError,
	type ClientPromise,
	type FetchOptions,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
} from "@rest-rpc/core";
import { createBodyCodecRegistry } from "@rest-rpc/core/codecs";
import { readResponse, type RequestArgs } from "@rest-rpc/core/client";
import { markDefined, type RouteDefinition } from "@rest-rpc/core/contract";
import type { Merge } from "@rest-rpc/core/utils";
import type { InitialContextOf } from "../builder/routeBuilder.types.ts";
import type { ContextOption, OptionsArgs } from "./handleOptions.ts";
import {
	toRuntimeImplementation,
	type ImplementedRoute,
} from "../routing/match.ts";
import { executeRoute, type RouteResult } from "./handleHttpRoute.ts";
import type { RequestSegments } from "./validation.ts";
import { toSseEvent } from "./sse.ts";

/** Options accepted by `call`. `context` is required when the route requires initial context. */
export type CallOptions<TRoute extends ImplementedRoute> = Merge<
	Pick<FetchOptions, "signal"> &
		ContextOption<InitialContextOf<TRoute["~restrpc"]>>
>;

type CallArgs<TRoute extends ImplementedRoute> = RequestArgs<
	InferClientRequest<TRoute>,
	OptionsArgs<InitialContextOf<TRoute["~restrpc"]>, CallOptions<TRoute>>
>;

const toSseEvents = async function* (stream: AsyncIterable<unknown>) {
	for await (const item of stream) yield toSseEvent(item);
};

// Mirrors the fetch client, which receives the content type that is sent.
const toCallResult = ({
	status,
	headers = {},
	cookies = [],
	body,
}: RouteResult) => ({
	status,
	headers: body
		? {
				"content-type":
					"stream" in body ? "text/event-stream" : body.contentType,
				...headers,
			}
		: headers,
	cookies,
	body: body && ("stream" in body ? toSseEvents(body.stream) : body.value),
});

/** The promise a local call returns, which carries the errors it rejects with. */
// The conditional keeps editors from displaying this alias instead of the resolved promise.
type CallResult<TRoute extends ImplementedRoute> = TRoute extends unknown
	? ClientPromise<InferClientResponse<TRoute>, InferClientError<TRoute> | Error>
	: never;

// Mirrors the fetch client: an error the route defines is received as a new,
// defined error with what is sent, and other errors as they are.
const toClientError = (route: RouteDefinition, error: RouteError) => {
	// Server routes keep their error classes, which contracts serialize as data.
	const definition = route.errors?.[error.code] as
		| (abstract new (...args: never[]) => RouteError)
		| undefined;
	if (!definition || !(error instanceof definition)) return error;
	const { code, message, status, data, headers, cookies } = error;
	return markDefined(
		new RouteError(code, { message, status, data, headers, cookies }),
	);
};

const defaultCodecs = createBodyCodecRegistry([]);

const callRoute = async (
	route: ImplementedRoute,
	request: unknown,
	options: CallOptions<ImplementedRoute>,
) => {
	const implementation = toRuntimeImplementation(route["~restrpc"]);
	const { signal, context } = options;
	// Over HTTP, a defined query and headers are at least `{}`.
	const {
		query = {},
		headers = {},
		...segments
	} = (request ?? {}) as RequestSegments;
	let result: RouteResult | Response;
	try {
		result = await executeRoute(implementation, {
			request: { ...segments, query, headers },
			signal: signal ?? new AbortController().signal,
			context,
		});
	} catch (error) {
		throw error instanceof RouteError
			? toClientError(implementation.route, error)
			: error;
	}
	// A returned `Response` is received as the fetch client receives it.
	return result instanceof Response
		? readResponse(result, implementation.route, false, defaultCodecs)
		: toCallResult(result);
};

/**
 * Calls a route handler locally, without HTTP serialization.
 *
 * @remarks options can be used to provide values HTTP request would normally
 * provide. Rejects like the fetch client: with the `RouteError` that would be
 * sent, marked as defined when the route defines its code. Other errors
 * thrown by the handler reject unchanged.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/local-calls}
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
