import { RouteError } from "@rest-rpc/core";
import { isAsyncIterable, normalizeMediaType } from "@rest-rpc/core/codecs";
import type {
	ResponseContentDefinition,
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
	/**
	 * The defined body media type selected for the request. Handlers receive
	 * it as `contentType`.
	 */
	mediaType?: string;
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
	contentType?: string;
	sse?: RespondOptions["sse"];
};

// A response with one media type may omit it; otherwise the handler selects one.
const selectResponseMediaType = (
	content: ResponseContentDefinition,
	selected: unknown,
	defaultMediaType: string | undefined,
): string => {
	const mediaType = typeof selected === "string" ? selected : defaultMediaType;
	if (mediaType === undefined || !(mediaType in content)) {
		throw new Error("Unsupported response body contentType.");
	}
	return mediaType;
};

const normalizeResponseResult = (
	implementation: RuntimeImplementation,
	result: DefinedResponseEnvelope,
	disableValidation: boolean,
): MaybePromise<RouteResult> => {
	const schema = getResponseSchema(implementation.route, result.status);
	const { content } = schema;
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

	if (content === undefined) {
		return mapMaybePromise(validatedHeaders, withHeaders);
	}

	const mediaType = selectResponseMediaType(
		content,
		result.contentType,
		implementation.defaultResponseMediaTypes[result.status],
	);
	// A `text/event-stream` schema validates each item of the stream.
	if (mediaType === "text/event-stream") {
		const body = result.body as AsyncIterable<unknown>;
		return mapMaybePromise(validatedHeaders, (headers) => ({
			...withHeaders(headers),
			body: {
				stream: disableValidation
					? body
					: validateResponseStreamChunks(body, content[mediaType]!),
				sse: result.sse,
			},
		}));
	}

	const validatedValue = disableValidation
		? result.body
		: validateResponseValue(content[mediaType], result.body, "body");
	return mapMaybePromise(
		allMaybePromise([validatedHeaders, validatedValue]),
		([headers, value]) => ({
			...withHeaders(headers),
			body: { value, contentType: mediaType },
		}),
	);
};

/** A validated logical response for the Fetch and Node handlers to serialize and write. */
export type HttpRouteResult = ResponseHeaderFields & {
	status: number;
	body?: { value: unknown; contentType: string };
};

// Errors are thrown, so inferred statuses are successful.
const assertImplicitStatus = (status: number) => {
	if (!Number.isInteger(status) || status < 200 || status > 299) {
		throw new Error(
			`Inferred response status "${status}" must be from 200 to 299.`,
		);
	}
};

// Async iterables are SSE streams unless another content type sends them
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
	const {
		status = 200,
		body,
		contentType,
		headers,
		cookies,
		sse,
	} = toEnvelope(result);
	assertImplicitStatus(status);
	// `undefined` has no JSON representation, so it is sent without a body.
	if (body === undefined) return { status, headers, cookies };
	return {
		status,
		headers,
		cookies,
		body: toImplicitBody(body, contentType, sse),
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
	const { mediaType } = options;
	const request = options.disableRequestValidation
		? options.request
		: await validateRequestSegments(route, options.request, mediaType);
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
			contentType: mediaType,
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

/** Observes a `RouteError` that ends a stream after its response started. */
type StreamErrorObserver = (error: RouteError) => void;

const observeStream = async function* (
	stream: AsyncIterable<unknown>,
	observe: StreamErrorObserver,
) {
	try {
		yield* stream;
	} catch (error) {
		if (error instanceof RouteError) observe(error);
		throw error;
	}
};

/** Frames a stream body as SSE; other results are already HTTP results. */
export const toHttpRouteResult = (
	result: RouteResult | Response,
	observe: StreamErrorObserver | undefined,
	sse: SseOptions | undefined,
): HttpRouteResult | Response => {
	if (result instanceof Response) return result;
	const { status, headers, cookies, body } = result;
	if (!body || !("stream" in body)) return result as HttpRouteResult;
	return {
		status,
		headers,
		cookies,
		body: sseBody(observe ? observeStream(body.stream, observe) : body.stream, {
			...sse,
			...body.sse,
		}),
	};
};
