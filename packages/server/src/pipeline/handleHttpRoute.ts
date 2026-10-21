import { isAsyncIterable, normalizeMediaType } from "@rest-rpc/core/codecs";
import { RequestValidationError, ResponseValidationError } from "./errors.ts";
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

/**
 * Per-request options for compiled routes and the catch-all handler.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/server/fetch#handle-options}
 */
export type HandleOptions = {
	/**
	 * Initial context values, set before middleware runs. Values are not
	 * type-checked against the context types routes declare.
	 */
	context?: Record<string, unknown>;
	/**
	 * Percent-decoded path params, for requests whose URL does not contain the
	 * route path. When omitted, params a router set as `request.params`, as Bun
	 * and Express do, are used, or else they are read from the request URL.
	 */
	params?: Record<string, string>;
	/**
	 * An already decoded request body, such as one parsed by a framework's body
	 * parser. When the key is present, even as `undefined`, the request body is
	 * not read. The value is still validated against the route's body schema.
	 */
	body?: unknown;
};

/** Inputs needed to invoke one route handler with decoded request segments. */
export type ExecuteRouteOptions = {
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
		: validateResponseHeaders(schema, result.headers);

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
export const isResponseEnvelope = (
	value: unknown,
): value is ImplicitResponseEnvelope =>
	typeof value === "object" &&
	value !== null &&
	"status" in value &&
	typeof value.status === "number";

const assertImplicitStatus = (status: number) => {
	if (!Number.isInteger(status) || status < 100 || status > 599) {
		throw new Error(`Invalid inferred HTTP response status "${status}".`);
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

/**
 * Validates decoded request segments, executes middleware and the handler, and
 * validates the selected output. Validation errors are thrown.
 */
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

// Only stream bodies change; other results are already HTTP results.
const toHttpRouteResult = (result: RouteResult): HttpRouteResult => {
	const { status, headers, body } = result;
	if (!body || !("stream" in body)) return result as HttpRouteResult;
	return { status, headers, body: sseBody(body.stream) };
};

const toValidationError = (
	error: unknown,
): RequestValidationError | ResponseValidationError => {
	if (
		error instanceof RequestValidationError ||
		error instanceof ResponseValidationError
	) {
		return error;
	}
	throw error;
};

/**
 * Validates an HTTP request, executes middleware and its handler, and normalizes the selected output.
 * Returns validation errors for adapter handling; other failures propagate.
 */
export function handleHttpRoute(
	implementation: RuntimeImplementation,
	options: ExecuteRouteOptions,
): MaybePromise<
	HttpRouteResult | RequestValidationError | ResponseValidationError
> {
	try {
		const execution = executeRoute(implementation, options);
		return execution instanceof Promise
			? execution.then(toHttpRouteResult, toValidationError)
			: toHttpRouteResult(execution);
	} catch (error) {
		return toValidationError(error);
	}
}
