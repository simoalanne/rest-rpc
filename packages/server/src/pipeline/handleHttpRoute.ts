import { RouteError } from "@rest-rpc/core";
import { isAsyncIterable, normalizeMediaType } from "@rest-rpc/core/codecs";
import type {
	ResponseContentDeclaration,
	ResponseDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import type {
	ImplicitResponseEnvelope,
	RuntimeRouteHandler,
} from "../builder/routeBuilder.types.ts";
import type { RuntimeImplementation } from "../routing/match.ts";
import {
	type RequestSegments,
	validateRequestSegments,
	validateResponseValue,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { invokeWithMiddleware } from "../builder/middleware.ts";
import { sseBody } from "./sse.ts";
import { createContext } from "../builder/context.ts";
import type { MaybePromise } from "@rest-rpc/core/utils";
import { allMaybePromise, mapMaybePromise } from "./maybePromise.ts";

/** Inputs needed to invoke one route handler with decoded request segments. */
type ExecuteRouteOptions = {
	request: RequestSegments;
	/** Aborts when the client disconnects. */
	signal: AbortSignal;
	/**
	 * The declared body media type selected for the request. Handlers receive
	 * it as `contentType`.
	 */
	mediaType?: string;
	/** Initial context values, set before middleware runs. */
	context?: Record<string, unknown>;
	disableRequestValidation?: boolean;
	disableResponseValidation?: boolean;
};

/** A validated route result before SSE framing and header serialization. */
export type RouteResult = {
	status: number;
	headers?: Record<string, unknown>;
	body?:
		| { value: unknown; contentType: string }
		| { stream: AsyncIterable<unknown> };
};

const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration => {
	const response = route.responses[status];
	if (!response) {
		throw new Error(
			`Route response for "${route.method} ${route.path}" returned undeclared status ${status}.`,
		);
	}

	return response;
};

type DeclaredResponseEnvelope = {
	status: number;
	body?: unknown;
	contentType?: string;
	headers?: Record<string, unknown>;
};

// A response with one media type may omit it; otherwise the handler selects one.
const selectResponseMediaType = (
	content: ResponseContentDeclaration,
	selected: unknown,
	defaultMediaType: string | undefined,
): string => {
	const mediaType =
		typeof selected === "string"
			? normalizeMediaType(selected)
			: defaultMediaType;
	if (mediaType === undefined || !(mediaType in content)) {
		throw new Error("Unsupported response body contentType.");
	}
	return mediaType;
};

const normalizeResponseResult = (
	implementation: RuntimeImplementation,
	result: DeclaredResponseEnvelope,
	disableValidation: boolean,
): MaybePromise<RouteResult> => {
	const schema = getResponseSchema(implementation.route, result.status);
	const { content } = schema;
	const validatedHeaders = disableValidation
		? schema.headers
			? result.headers
			: undefined
		: validateResponseHeaders(schema.headers, result.headers);

	if (content === undefined) {
		return mapMaybePromise(validatedHeaders, (headers) => ({
			status: result.status,
			headers,
		}));
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
			status: result.status,
			headers,
			body: {
				stream: disableValidation
					? body
					: validateResponseStreamChunks(body, content[mediaType]!),
			},
		}));
	}

	const validatedValue = disableValidation
		? result.body
		: validateResponseValue(content[mediaType], result.body, "body");
	return mapMaybePromise(
		allMaybePromise([validatedHeaders, validatedValue]),
		([headers, value]) => ({
			status: result.status,
			headers,
			body: { value, contentType: mediaType },
		}),
	);
};

/** A validated logical response for the Fetch and Node handlers to serialize and write. */
export type HttpRouteResult = {
	status: number;
	headers?: Record<string, unknown>;
	body?: { value: unknown; contentType: string };
};

/** A handler result with a numeric `status` is a response envelope; anything else is a 200 body. */
const isResponseEnvelope = (
	value: unknown,
): value is ImplicitResponseEnvelope =>
	typeof value === "object" &&
	value !== null &&
	"status" in value &&
	typeof value.status === "number";

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
): NonNullable<RouteResult["body"]> =>
	isAsyncIterable(body) &&
	(contentType === undefined ||
		normalizeMediaType(contentType) === "text/event-stream")
		? { stream: body }
		: { value: body, contentType: contentType ?? "application/json" };

/** Normalizes the result of a handler on a route without declared responses. */
export const normalizeImplicitResponse = (result: unknown): RouteResult => {
	if (!isResponseEnvelope(result)) {
		return { status: 200, body: toImplicitBody(result, undefined) };
	}
	assertImplicitStatus(result.status);
	const { status, headers } = result;
	if (!("body" in result)) return { status, headers };
	return {
		status,
		headers,
		body: toImplicitBody(result.body, result.contentType),
	};
};

const normalizeHandlerResult = (
	implementation: RuntimeImplementation,
	handlerResult: unknown,
	disableResponseValidation: boolean,
): MaybePromise<RouteResult> => {
	const { defaultStatus } = implementation;
	if (defaultStatus === undefined) {
		return normalizeImplicitResponse(handlerResult);
	}

	// Types only allow plain bodies on routes with a single declared status.
	return normalizeResponseResult(
		implementation,
		isResponseEnvelope(handlerResult)
			? handlerResult
			: { status: defaultStatus, body: handlerResult },
		disableResponseValidation,
	);
};

/** Validates the request, runs middleware and the handler, and validates the output, throwing validation errors. */
export function executeRoute(
	implementation: RuntimeImplementation,
	options: ExecuteRouteOptions,
): MaybePromise<RouteResult> {
	const { route } = implementation;
	const handler = implementation.handler as RuntimeRouteHandler;
	const { mediaType } = options;
	const validation = options.disableRequestValidation
		? options.request
		: validateRequestSegments(route, options.request, mediaType);
	const handlerResult = mapMaybePromise(validation, (validatedRequest) =>
		invokeWithMiddleware(implementation.middleware, handler, {
			body: validatedRequest.body,
			query: validatedRequest.query,
			params: validatedRequest.params,
			headers: validatedRequest.headers,
			context: createContext(options.context),
			signal: options.signal,
			contentType: mediaType,
			route,
			errors: implementation.errorFactories,
		}),
	);
	return mapMaybePromise(handlerResult, (result) =>
		normalizeHandlerResult(
			implementation,
			result,
			options.disableResponseValidation ?? false,
		),
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

// Only stream bodies change; other results are already HTTP results.
const toHttpRouteResult = (
	result: RouteResult,
	observe: StreamErrorObserver | undefined,
): HttpRouteResult => {
	const { status, headers, body } = result;
	if (!body || !("stream" in body)) return result as HttpRouteResult;
	return {
		status,
		headers,
		body: sseBody(observe ? observeStream(body.stream, observe) : body.stream),
	};
};

/** Runs a route and normalizes its output for serialization. Errors, including `RouteError`s, propagate. */
export function handleHttpRoute(
	implementation: RuntimeImplementation,
	options: ExecuteRouteOptions & { onStreamError?: StreamErrorObserver },
): MaybePromise<HttpRouteResult> {
	return mapMaybePromise(executeRoute(implementation, options), (result) =>
		toHttpRouteResult(result, options.onStreamError),
	);
}
