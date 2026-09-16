import type {
	ResponseBodySchema,
	ResponseDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import { getRouteResponses } from "@rest-rpc/core/contract";
import type { HttpHeaders } from "./headers.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import { RequestValidationError } from "./validationErrors.ts";
import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";
import type { ImplicitResponseEnvelope } from "./routeBuilder.types.ts";
import {
	resolveCustomResponseBody,
	type RequestSegments,
	validateRequest,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";

type HttpRouteResultBase = {
	status: number;
	headers?: HttpHeaders;
};

/**
 * A normalized HTTP route result ready for an adapter-specific writer.
 */
export type HttpRouteResult =
	| (HttpRouteResultBase & { kind: "empty" })
	| (HttpRouteResultBase & { kind: "json"; body: unknown })
	| (HttpRouteResultBase & {
			kind: "custom";
			body: unknown;
			contentType: string;
	  })
	| (HttpRouteResultBase & {
			kind: "stream";
			body: AsyncIterable<unknown>;
	  });

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

const usesFlatInput = (route: RouteDeclaration) =>
	route.input === "input" ||
	(route.input === undefined && route.kind === "procedure");

const usesPlainOutput = (route: RouteDeclaration) =>
	route.output === "output" ||
	(route.output === undefined && route.kind === "procedure");

const hasStatus = (value: unknown): value is ImplicitResponseEnvelope =>
	typeof value === "object" && value !== null && "status" in value;

const classifyImplicitProcedureResponse = (
	output: unknown,
): HttpRouteResult => {
	if (isAsyncIterable(output)) {
		return { kind: "stream", status: 200, body: output };
	}
	if (isCustomProcedureOutput(output)) {
		return {
			kind: "custom",
			status: 200,
			body: output.data,
			contentType: output.contentType,
		};
	}
	return { kind: "json", status: 200, body: output };
};

const classifyImplicitHttpResponse = (
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
			kind: "empty",
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

	const { contentType } = response;
	if (contentType !== undefined) {
		return {
			kind: "custom",
			status: response.status,
			headers,
			body,
			contentType,
		};
	}

	return { kind: "json", status: response.status, headers, body };
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

const normalizeCustomBodyResult = async (
	schema: ResponseBodySchema,
	declaredContentType: string | readonly string[],
	body: unknown,
	contentType: unknown,
) => {
	const result = resolveCustomResponseBody(
		declaredContentType,
		body,
		contentType,
		"Unsupported custom response body contentType.",
	);

	return {
		contentType: result.contentType,
		body: await validateResponseBody(schema, result.body),
	};
};

const normalizeResponseResult = async (
	route: RouteDeclaration,
	result: DeclaredResponseEnvelope,
): Promise<HttpRouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const bodySchema = schema.body;
	const declaredHeaders = await validateResponseHeaders(
		schema,
		result.responseHeaders,
	);
	const headers = declaredHeaders;

	if (bodySchema === undefined) {
		return {
			kind: "empty",
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

	const declaredContentType = schema.contentType;
	if (declaredContentType === "application/json") {
		return {
			kind: "json",
			status: result.status,
			headers,
			body: await validateResponseBody(bodySchema, result.body),
		};
	}

	if (declaredContentType !== undefined) {
		const customResult = await normalizeCustomBodyResult(
			bodySchema,
			declaredContentType,
			result.body,
			result.contentType,
		);
		return {
			kind: "custom",
			status: result.status,
			headers,
			contentType: customResult.contentType,
			body: customResult.body,
		};
	}

	return {
		kind: "json",
		status: result.status,
		headers,
		body: await validateResponseBody(bodySchema, result.body),
	};
};

const normalizeRouteResponseError = async (
	route: RouteDeclaration,
	error: RouteResponseError,
): Promise<HttpRouteResult> => {
	return normalizeResponseResult(route, {
		status: error.status,
		body: error.body,
		contentType: error.contentType,
		responseHeaders: error.responseHeaders,
	});
};

/**
 * Validates an HTTP request, invokes a route handler, and normalizes its result.
 */
export async function handleHttpRoute<
	TAdditionalHandlerFields extends object = Record<never, never>,
	TContext extends object = Record<never, never>,
>(
	route: RouteDeclaration,
	handler: RuntimeRouteHandler,
	options: HandleHttpRouteOptions<TAdditionalHandlerFields, TContext>,
): Promise<HttpRouteResult> {
	const requestValidation = await validateRequest(route, options.request);
	if (!requestValidation.success) {
		throw new RequestValidationError(requestValidation.issues);
	}

	let handlerResult: unknown;
	try {
		handlerResult = await handler({
			...options.handlerFields,
			...(usesFlatInput(route)
				? route.request?.body || route.request?.query
					? {
							input:
								route.method === "GET"
									? requestValidation.data.query
									: requestValidation.data.body,
							...("contentType" in requestValidation.data
								? { contentType: requestValidation.data.contentType }
								: {}),
						}
					: {}
				: requestValidation.data),
			context: options.context,
			route,
		});
	} catch (error) {
		if (error instanceof RouteResponseError) {
			return normalizeRouteResponseError(route, error);
		}
		throw error;
	}

	const hasDeclaredResponses = Object.keys(route.responses).length > 0;
	if (!hasDeclaredResponses) {
		return hasStatus(handlerResult)
			? classifyImplicitHttpResponse(handlerResult)
			: classifyImplicitProcedureResponse(handlerResult);
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
			return normalizeResponseResult(route, {
				status: 200,
				body: handlerResult.data,
				contentType: handlerResult.contentType,
			});
		}

		return normalizeResponseResult(route, { status: 200, body: handlerResult });
	}

	return normalizeResponseResult(
		route,
		handlerResult as DeclaredResponseEnvelope,
	);
}
