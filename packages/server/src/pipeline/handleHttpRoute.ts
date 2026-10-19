import {
	contentTypeList,
	findDeclaredContentType,
	isAsyncIterable,
	normalizeMediaType,
} from "@rest-rpc/core/codecs";
import { RequestValidationError, ResponseValidationError } from "./errors.ts";
import type {
	RequestScalar,
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
 * @see {@link https://rest-rpc.dev/docs/context#values-from-the-host}
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

const selectResponseContentType = (
	declared: string | readonly string[],
	selected: unknown,
): string => {
	const types = contentTypeList(declared);
	const contentType =
		typeof selected === "string"
			? findDeclaredContentType(types, selected)
			: types.length === 1
				? types[0]
				: undefined;
	if (!contentType) throw new Error("Unsupported response body contentType.");
	return contentType;
};

const normalizeResponseResult = async (
	route: RouteDeclaration,
	result: DeclaredResponseEnvelope,
	disableValidation: boolean,
): Promise<HttpRouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const bodySchema = schema.body;
	const headers = disableValidation
		? schema.headers
			? stringifyHeaders(result.headers)
			: undefined
		: await validateResponseHeaders(schema, result.headers);

	if (bodySchema === undefined) {
		return { status: result.status, headers };
	}

	if (schema.kind === "stream") {
		const body = result.body as AsyncIterable<unknown>;
		return {
			status: result.status,
			headers,
			body: sseBody(
				disableValidation
					? body
					: validateResponseStreamChunks(body, bodySchema),
			),
		};
	}

	return {
		status: result.status,
		headers,
		body: {
			value: disableValidation
				? result.body
				: await validateResponseValue(bodySchema, result.body, "body"),
			contentType: selectResponseContentType(
				schema.contentType ?? "application/json",
				result.contentType,
			),
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
): HttpRouteResult => {
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

	// An explicit content type sends a stream through the body codecs as-is.
	const { body, contentType } = response;
	if (contentType === undefined && isAsyncIterable(body)) {
		return { status, headers, body: sseBody(body) };
	}
	return {
		status,
		headers,
		body: { value: body, contentType: contentType ?? "application/json" },
	};
};

export const normalizeImplicitResponse = (result: unknown): HttpRouteResult =>
	normalizeImplicitHttpResponse(
		isResponseEnvelope(result) ? result : { status: 200, body: result },
	);

/**
 * Validates an HTTP request, executes middleware and its handler, and normalizes the selected output.
 * Returns validation errors for adapter handling; other failures propagate.
 */
export async function handleHttpRoute(
	implementation: RuntimeImplementation,
	options: HandleHttpRouteOptions,
): Promise<HttpRouteResult | RequestValidationError | ResponseValidationError> {
	try {
		const { route } = implementation;
		const handler = implementation.handler as RuntimeRouteHandler;
		const rawContentType = requestHeader(
			options.request.headers,
			"content-type",
		);
		const contentType = normalizeMediaType(rawContentType) || undefined;
		const lastEventId = requestHeader(options.request.headers, "last-event-id");
		const disableRequestValidation =
			options.configuration?.disableRequestValidation ?? false;
		const validatedRequest = disableRequestValidation
			? readDeclaredRequestSegments(route, options.request)
			: await validateRequestSegments(route, options.request);
		const disableResponseValidation =
			options.configuration?.disableResponseValidation ?? false;

		const handlerResult = await invokeWithMiddleware(
			implementation.middleware ?? [],
			handler,
			{
				...validatedRequest,
				context: createContext(options.context),
				signal: options.signal,
				contentType,
				lastEventId,
				route,
			},
		);

		const declaredStatuses = Object.keys(route.responses);
		if (declaredStatuses.length === 0) {
			return normalizeImplicitResponse(handlerResult);
		}

		// Types only allow plain bodies on routes with a single declared status.
		return await normalizeResponseResult(
			route,
			isResponseEnvelope(handlerResult)
				? handlerResult
				: { status: Number(declaredStatuses[0]), body: handlerResult },
			disableResponseValidation,
		);
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
