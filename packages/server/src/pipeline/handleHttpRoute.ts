import { isAsyncIterable, normalizeMediaType } from "@rest-rpc/core/codecs";
import type {
	ResponseDefinition,
	RouteDefinition,
} from "@rest-rpc/core/contract";
import type { RuntimeRouteHandler } from "../builder/routeBuilder.types.ts";
import type { RuntimeImplementation } from "../routing/match.ts";
import {
	type RequestSegments,
	validateRequestSegments,
	validateResponseValue,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { invokeWithMiddleware } from "../builder/middleware.ts";
import { isResponseEnvelope, respond, type RespondOptions } from "./respond.ts";
import { fromRawEnvelope } from "./rawResponse.ts";
import { sseBody, type SseOptions } from "./sse.ts";
import type { MaybePromise } from "@rest-rpc/core/utils";
import { allMaybePromise, mapMaybePromise } from "./maybePromise.ts";

/** Inputs needed to invoke one route handler with decoded request segments. */
type ExecuteRouteOptions = {
	request: RequestSegments;
	/** Aborts when the client disconnects. */
	signal: AbortSignal;
	/** Whether the headers were validated before the body was decoded. */
	headersValidated?: boolean;
	/** The initial context the host provides. */
	context?: object;
	disableRequestValidation?: boolean;
	disableResponseValidation?: boolean;
};

type ResponseHeaderFields = {
	headers?: Record<string, unknown>;
	cookies?: readonly string[];
};

/** A validated route result before SSE framing and header serialization. */
export type RouteResult = ResponseHeaderFields & {
	status: number;
	body?:
		| { value: unknown; contentType: string }
		| { stream: AsyncIterable<unknown>; sse?: RespondOptions["sse"] };
};

const getResponseSchema = (
	route: RouteDefinition,
	status: number,
): ResponseDefinition => {
	const response = route.responses[status];
	if (!response) {
		throw new Error(
			`Route response for "${route.method} ${route.path}" returned status ${status}, which it does not define.`,
		);
	}

	return response;
};

type DefinedResponseEnvelope = ResponseHeaderFields & {
	status: number;
	body?: unknown;
	sse?: RespondOptions["sse"];
};

// A body's content type is its `content-type` header, and JSON without one.
const contentTypeOf = (headers: Record<string, unknown> | undefined) => {
	const contentType = headers?.["content-type"];
	return typeof contentType === "string" ? contentType : undefined;
};

const normalizeResponseResult = (
	implementation: RuntimeImplementation,
	result: DefinedResponseEnvelope,
	disableValidation: boolean,
): MaybePromise<RouteResult> => {
	const schema = getResponseSchema(implementation.route, result.status);
	const withHeaders = (headers: RouteResult["headers"]) => ({
		status: result.status,
		headers,
		cookies: result.cookies,
	});
	const validatedHeaders = disableValidation
		? schema.headers
			? result.headers
			: undefined
		: validateResponseHeaders(schema.headers, result.headers);

	// An `sse` schema validates each item of the stream.
	if (schema.sse) {
		const body = result.body as AsyncIterable<unknown>;
		const items = schema.sse;
		return mapMaybePromise(validatedHeaders, (headers) => ({
			...withHeaders(headers),
			body: {
				stream: disableValidation
					? body
					: validateResponseStreamChunks(body, items),
				sse: result.sse,
			},
		}));
	}
	if (!schema.body) return mapMaybePromise(validatedHeaders, withHeaders);

	const validatedValue = disableValidation
		? result.body
		: validateResponseValue(schema.body, result.body, "body");
	// The validated headers, which are also the ones sent, select the codec.
	return mapMaybePromise(
		allMaybePromise([validatedHeaders, validatedValue]),
		([headers, value]) => ({
			...withHeaders(headers),
			body: {
				value,
				contentType: contentTypeOf(headers) ?? "application/json",
			},
		}),
	);
};

/** A validated logical response for the Fetch and Node handlers to serialize and write. */
export type HttpRouteResult = ResponseHeaderFields & {
	status: number;
	/** A value for the codecs, or a framed SSE stream, which skips them. */
	body?:
		| { value: unknown; contentType: string }
		| { events: AsyncIterable<string> };
};

// Errors are thrown, so inferred statuses are successful.
const assertImplicitStatus = (status: number) => {
	if (!Number.isInteger(status) || status < 200 || status > 299) {
		throw new Error(
			`Inferred response status "${status}" must be from 200 to 299.`,
		);
	}
};

// Async iterables are SSE streams unless a `content-type` header sends them
// through the body codecs.
const toImplicitBody = (
	body: unknown,
	contentType: string | undefined,
	sse: RespondOptions["sse"],
): NonNullable<RouteResult["body"]> =>
	isAsyncIterable(body) &&
	(contentType === undefined ||
		normalizeMediaType(contentType) === "text/event-stream")
		? { stream: body, sse }
		: { value: body, contentType: contentType ?? "application/json" };

// Only `respond()` results are envelopes; any other value is the body.
const toEnvelope = (result: unknown): RespondOptions & { body?: unknown } =>
	isResponseEnvelope(result) ? result : { body: result };

/** Normalizes the result of a handler on a route without defined responses. */
const normalizeImplicitResponse = (result: unknown): RouteResult => {
	const { status = 200, body, headers, cookies, sse } = toEnvelope(result);
	assertImplicitStatus(status);
	// `undefined` has no JSON representation, so it is sent without a body.
	if (body === undefined) return { status, headers, cookies };
	return {
		status,
		headers,
		cookies,
		body: toImplicitBody(body, contentTypeOf(headers), sse),
	};
};

/** Normalizes and validates a handler result, synchronously when the response schemas and headers are. */
export const normalizeHandlerResult = (
	implementation: RuntimeImplementation,
	handlerResult: unknown,
	disableResponseValidation: boolean,
): MaybePromise<RouteResult> => {
	const { defaultStatus } = implementation;
	if (defaultStatus === undefined) {
		return normalizeImplicitResponse(handlerResult);
	}

	// Types only allow plain bodies on routes with a single defined status, and
	// a missing `respond()` status on its only or 200 status.
	const { status = defaultStatus, ...result } = toEnvelope(handlerResult);
	return normalizeResponseResult(
		implementation,
		{ status, ...result },
		disableResponseValidation,
	);
};

const emptyContext = Object.freeze({});

/**
 * Validates the request, runs middleware and the handler, and validates the
 * output, throwing validation errors. A returned `Response` is sent as is.
 */
export async function executeRoute(
	implementation: RuntimeImplementation,
	options: ExecuteRouteOptions,
): Promise<RouteResult | Response> {
	const { route } = implementation;
	const handler = implementation.handler as RuntimeRouteHandler;
	const request = options.disableRequestValidation
		? options.request
		: await validateRequestSegments(
				route,
				options.request,
				options.headersValidated,
			);
	const result = await invokeWithMiddleware(
		implementation.middleware,
		handler,
		{
			body: request.body,
			query: request.query,
			params: request.params,
			headers: request.headers,
			context: options.context ?? emptyContext,
			signal: options.signal,
			route,
			errors: implementation.errorFactories,
			respond,
		},
		implementation.defaultStatus ?? 200,
	);
	if (result instanceof Response) return result;
	// After middleware, a `Response` body is sent with the envelope's other fields.
	if (isResponseEnvelope(result) && result.body instanceof Response) {
		return fromRawEnvelope(result as Parameters<typeof fromRawEnvelope>[0]);
	}
	return normalizeHandlerResult(
		implementation,
		result,
		options.disableResponseValidation ?? false,
	);
}

/** Frames a stream body as SSE; other results are already HTTP results. */
export const toHttpRouteResult = (
	result: RouteResult | Response,
	sse: SseOptions | undefined,
): HttpRouteResult | Response => {
	if (result instanceof Response) return result;
	const { status, headers, cookies, body } = result;
	if (!body || !("stream" in body)) return result as HttpRouteResult;
	return {
		status,
		headers,
		cookies,
		body: sseBody(body.stream, {
			...sse,
			...body.sse,
		}),
	};
};
