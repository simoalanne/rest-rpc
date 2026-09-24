import { normalizeMediaType } from "@rest-rpc/core/codecs";
import {
	RequestValidationError,
	ResponseValidationError,
} from "./validationErrors.ts";
import type {
	ResponseDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import { getRouteResponses } from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";
import type { RuntimeImplementation } from "./match.ts";
import type { ImplicitResponseEnvelope } from "./routeBuilder.types.ts";
import {
	type RequestSegments,
	validateRequestSegments,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { invokeWithMiddleware } from "./middleware.ts";

/** A validated logical response for adapter-specific serialization and delivery. */
export type HttpRouteResult =
	| {
			kind: "response";
			status: number;
			headers?: HttpHeaders;
			body?: { value: unknown; contentType: string };
	  }
	| {
			kind: "stream";
			status: number;
			headers?: HttpHeaders;
			body: AsyncIterable<unknown>;
	  };

/**
 * Inputs needed to invoke and normalize one HTTP route handler.
 */
export type HandleHttpRouteOptions<
	TAdditionalHandlerFields extends object = Record<never, never>,
	TContext extends object = Record<never, never>,
> = {
	request: RequestSegments;
	context: TContext;
	handlerFields: TAdditionalHandlerFields;
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
	value !== null &&
	(typeof value === "object" || typeof value === "function") &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";

const isCustomProcedureOutput = (
	value: unknown,
): value is { contentType: string; data: unknown } =>
	typeof value === "object" &&
	value !== null &&
	"data" in value &&
	"contentType" in value &&
	typeof value.contentType === "string";

const usesPlainOutput = (route: RouteDeclaration) =>
	route.output === "output" ||
	(route.output === undefined && route.kind === "procedure");

const hasStatus = (value: unknown): value is ImplicitResponseEnvelope =>
	typeof value === "object" && value !== null && "status" in value;

const normalizeImplicitProcedureResponse = (
	output: unknown,
): HttpRouteResult => {
	if (isAsyncIterable(output)) {
		return { kind: "stream", status: 200, body: output };
	}
	if (isCustomProcedureOutput(output)) {
		return {
			kind: "response",
			status: 200,
			body: { value: output.data, contentType: output.contentType },
		};
	}
	return {
		kind: "response",
		status: 200,
		body: { value: output, contentType: "application/json" },
	};
};

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
	const headers = response.responseHeaders;
	if (!("body" in response)) {
		return {
			kind: "response",
			status: response.status,
			headers,
		};
	}

	const body = response.body;
	if (isAsyncIterable(body)) {
		return {
			kind: "stream",
			status: response.status,
			headers,
			body,
		};
	}

	return {
		kind: "response",
		status: response.status,
		headers,
		body: {
			value: body,
			contentType: response.contentType ?? "application/json",
		},
	};
};

const getResponseSchema = (
	route: RouteDeclaration,
	status: number,
): ResponseDeclaration => {
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	if (!entry) {
		throw new Error(
			`Route response for "${route.method} ${route.path}" returned undeclared status ${status}.`,
		);
	}

	return entry[1];
};

type DeclaredResponseEnvelope = {
	status: number;
	body?: unknown;
	contentType?: string;
	responseHeaders?: Record<string, unknown>;
};

const selectResponseContentType = (
	declared: string | readonly string[],
	selected: unknown,
): string => {
	const types = typeof declared === "string" ? [declared] : declared;
	const contentType =
		typeof selected === "string"
			? types.find(
					(type) => normalizeMediaType(type) === normalizeMediaType(selected),
				)
			: types.length === 1
				? types[0]
				: undefined;
	if (!contentType) throw new Error("Unsupported response body contentType.");
	return contentType;
};

const normalizeResponseResult = async (
	route: RouteDeclaration,
	result: DeclaredResponseEnvelope,
): Promise<HttpRouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const bodySchema = schema.body;
	const headers = await validateResponseHeaders(schema, result.responseHeaders);

	if (bodySchema === undefined) {
		return {
			kind: "response",
			status: result.status,
			headers,
		};
	}

	if (schema.kind === "stream") {
		return {
			kind: "stream",
			status: result.status,
			headers,
			body: validateResponseStreamChunks(
				result.body as AsyncIterable<unknown>,
				bodySchema,
			),
		};
	}

	return {
		kind: "response",
		status: result.status,
		headers,
		body: {
			value: await validateResponseBody(bodySchema, result.body),
			contentType: selectResponseContentType(
				schema.contentType ?? "application/json",
				result.contentType,
			),
		},
	};
};

const getHandlerRequestFields = (
	route: RouteDeclaration,
	segments: Omit<RequestSegments, "query"> & { query: unknown },
) => {
	if (route.input !== "input") return segments;
	return { input: route.method === "GET" ? segments.query : segments.body };
};

/**
 * Validates an HTTP request, executes middleware and its handler, and normalizes the selected output.
 * Returns validation errors for adapter handling; other failures propagate.
 */
export async function handleHttpRoute<
	TAdditionalHandlerFields extends object = Record<never, never>,
	TContext extends object = Record<never, never>,
>(
	implementation: RuntimeImplementation,
	options: HandleHttpRouteOptions<TAdditionalHandlerFields, TContext>,
): Promise<HttpRouteResult | RequestValidationError | ResponseValidationError> {
	try {
		const { route } = implementation;
		const handler = implementation.handler as RuntimeRouteHandler;
		const validatedRequest = await validateRequestSegments(
			route,
			options.request,
		);

		const handlerResult = await invokeWithMiddleware(
			implementation.middleware ?? [],
			handler,
			{
				...getHandlerRequestFields(route, validatedRequest),
				...options.handlerFields,
				context: options.context,
				route,
			},
		);

		const hasDeclaredResponses = Object.keys(route.responses).length > 0;
		if (!hasDeclaredResponses) {
			return hasStatus(handlerResult)
				? normalizeImplicitHttpResponse(handlerResult)
				: normalizeImplicitProcedureResponse(handlerResult);
		}

		if (usesPlainOutput(route)) {
			const response = getResponseSchema(route, 200);
			if (
				response.kind !== "stream" &&
				response.contentType !== "application/json"
			) {
				if (!isCustomProcedureOutput(handlerResult)) {
					throw new Error(
						"Custom procedure output must return { contentType, data }.",
					);
				}
				return await normalizeResponseResult(route, {
					status: 200,
					body: handlerResult.data,
					contentType: handlerResult.contentType,
				});
			}

			return await normalizeResponseResult(route, {
				status: 200,
				body: handlerResult,
			});
		}

		return await normalizeResponseResult(
			route,
			handlerResult as DeclaredResponseEnvelope,
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
