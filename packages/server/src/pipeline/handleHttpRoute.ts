import { isAsyncIterable, normalizeMediaType } from "@rest-rpc/core/codecs";
import { RequestValidationError, ResponseValidationError } from "./errors.ts";
import type {
	RequestScalar,
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
	stringifyHeaders,
	readDeclaredRequestSegments,
	validateRequestSegments,
	validateResponseValue,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { invokeWithMiddleware } from "../builder/middleware.ts";
import { sseBody } from "./sse.ts";
import { createContext } from "../builder/context.ts";
import type { CompileRoutesOptions } from "./compileRoutes.ts";

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
	 * Percent-decoded path params. Read from the request URL when omitted.
	 */
	params?: Record<string, string>;
	/**
	 * An already decoded request body, such as one parsed by a framework's body
	 * parser. When the key is present, even as `undefined`, the request body is
	 * not read. The value is still validated against the route's body schema.
	 */
	body?: unknown;
};

/** Inputs needed to invoke and normalize one HTTP route handler. */
export type HandleHttpRouteOptions = {
	request: RequestSegments;
	/** Aborts when the client disconnects. */
	signal: AbortSignal;
	configuration?: Pick<
		CompileRoutesOptions,
		"disableRequestValidation" | "disableResponseValidation"
	>;
	/** Initial context values, set before middleware runs. */
	context?: Record<string, unknown>;
};

/** Inputs needed to invoke one route handler with decoded request segments. */
export type ExecuteRouteOptions = {
	request: Record<string, unknown>;
	signal: AbortSignal;
	/**
	 * The received request content type. Handlers receive the declared body
	 * media type it selects.
	 */
	contentType?: string;
	lastEventId?: string;
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

const requestHeader = (headers: RequestSegments["headers"], name: string) => {
	const value = headers?.[name];
	return Array.isArray(value) ? value[0] : value;
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
): string => {
	const declared = Object.keys(content);
	const mediaType =
		typeof selected === "string"
			? normalizeMediaType(selected)
			: declared.length === 1
				? declared[0]
				: undefined;
	if (mediaType === undefined || !(mediaType in content)) {
		throw new Error("Unsupported response body contentType.");
	}
	return mediaType;
};

const normalizeResponseResult = async (
	route: RouteDeclaration,
	result: DeclaredResponseEnvelope,
	disableValidation: boolean,
): Promise<RouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const { content } = schema;
	const headers = disableValidation
		? schema.headers
			? result.headers
			: undefined
		: await validateResponseHeaders(schema, result.headers);

	if (content === undefined) {
		return { status: result.status, headers };
	}

	const mediaType = selectResponseMediaType(content, result.contentType);
	// A `text/event-stream` schema validates each item of the stream.
	if (mediaType === "text/event-stream") {
		const body = result.body as AsyncIterable<unknown>;
		return {
			status: result.status,
			headers,
			body: {
				stream: disableValidation
					? body
					: validateResponseStreamChunks(body, content[mediaType]!),
			},
		};
	}

	return {
		status: result.status,
		headers,
		body: {
			value: disableValidation
				? result.body
				: await validateResponseValue(content[mediaType], result.body, "body"),
			contentType: mediaType,
		},
	};
};

/** A validated logical response for the Fetch and Node handlers to serialize and write. */
export type HttpRouteResult = {
	status: number;
	headers?: Record<string, RequestScalar | undefined>;
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

const normalizeImplicitHttpResponse = (
	response: ImplicitResponseEnvelope,
): RouteResult => {
	if (
		!Number.isInteger(response.status) ||
		response.status < 100 ||
		response.status > 599
	) {
		throw new Error(
			`Invalid inferred HTTP response status "${response.status}".`,
		);
	}
	const { status, headers } = response;
	if (!("body" in response)) return { status, headers };

	// Async iterables are SSE streams unless another content type sends them
	// through the body codecs.
	const { body, contentType } = response;
	if (
		isAsyncIterable(body) &&
		(contentType === undefined ||
			normalizeMediaType(contentType) === "text/event-stream")
	) {
		return { status, headers, body: { stream: body } };
	}
	return {
		status,
		headers,
		body: { value: body, contentType: contentType ?? "application/json" },
	};
};

export const normalizeImplicitResponse = (result: unknown): RouteResult =>
	normalizeImplicitHttpResponse(
		isResponseEnvelope(result) ? result : { status: 200, body: result },
	);

/**
 * Validates decoded request segments, executes middleware and the handler, and
 * validates the selected output. Validation errors are thrown.
 */
export async function executeRoute(
	implementation: RuntimeImplementation,
	options: ExecuteRouteOptions,
): Promise<RouteResult> {
	const { route } = implementation;
	const handler = implementation.handler as RuntimeRouteHandler;
	// HTTP requests with undeclared media types are rejected before this.
	const mediaType =
		normalizeMediaType(options.contentType) ||
		Object.keys(route.request?.body ?? {})[0];
	const validatedRequest = options.disableRequestValidation
		? options.request
		: await validateRequestSegments(route, options.request, mediaType);

	const handlerResult = await invokeWithMiddleware(
		implementation.middleware ?? [],
		handler,
		{
			...validatedRequest,
			context: createContext(options.context),
			signal: options.signal,
			contentType: mediaType,
			lastEventId: options.lastEventId,
			route,
		},
	);

	const declaredStatuses = Object.keys(route.responses);
	if (declaredStatuses.length === 0) {
		return normalizeImplicitResponse(handlerResult);
	}

	// Types only allow plain bodies on routes with a single declared status.
	return normalizeResponseResult(
		route,
		isResponseEnvelope(handlerResult)
			? handlerResult
			: { status: Number(declaredStatuses[0]), body: handlerResult },
		options.disableResponseValidation ?? false,
	);
}

const toHttpRouteResult = ({
	status,
	headers,
	body,
}: RouteResult): HttpRouteResult => {
	const httpHeaders = headers && stringifyHeaders(headers);
	if (!body) return { status, headers: httpHeaders };
	return {
		status,
		headers: httpHeaders,
		body: "stream" in body ? sseBody(body.stream) : body,
	};
};

/**
 * Validates an HTTP request, executes middleware and its handler, and normalizes the selected output.
 * Returns validation errors for adapter handling; other failures propagate.
 */
export async function handleHttpRoute(
	implementation: RuntimeImplementation,
	options: HandleHttpRouteOptions,
): Promise<HttpRouteResult | RequestValidationError | ResponseValidationError> {
	try {
		const { headers } = options.request;
		const result = await executeRoute(implementation, {
			request: readDeclaredRequestSegments(
				implementation.route,
				options.request,
			),
			signal: options.signal,
			contentType: requestHeader(headers, "content-type"),
			lastEventId: requestHeader(headers, "last-event-id"),
			context: options.context,
			...options.configuration,
		});
		return toHttpRouteResult(result);
	} catch (error) {
		if (
			error instanceof RequestValidationError ||
			error instanceof ResponseValidationError
		) {
			return error;
		}
		throw error;
	}
}
