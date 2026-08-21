import type {
	CustomBody,
	HttpRouteDeclaration,
	ResponseBodySchema,
	ResponseDeclaration,
} from "@rest-rpc/core/contract";
import {
	getResponseBody,
	getResponseHeaders,
	getRouteResponses,
	isCustomBody,
	isNoBody,
	isStream,
	REQUEST_CONTEXT_KEY,
} from "@rest-rpc/core/contract";
import { validateStandardSchema } from "@rest-rpc/core/standard-schema";
import type {
	ServerErrorHandlers,
	ServerErrorResponse,
} from "./errorHandlers.ts";
import type { HttpHeaders } from "./headers.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import type { HttpRouteHandlerContext, RuntimeRouteHandler } from "./router.ts";
import { type RequestSegments, validateRequest } from "./validation.ts";

type HttpRouteResultBase = {
	status: number;
	headers?: HttpHeaders;
};

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
			contentType?: string;
	  });

export type HandleHttpRouteOptions<TContext extends HttpRouteHandlerContext> = {
	request: RequestSegments;
	context: TContext;
	errorContext?: Record<string, unknown>;
	errorHandlers?: ServerErrorHandlers<TContext>;
};

const getResponseSchema = (
	route: HttpRouteDeclaration,
	status: number,
): ResponseDeclaration | undefined => {
	const entry = Object.entries(getRouteResponses(route)).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const getSingleSuccessfulStatus = (
	route: HttpRouteDeclaration,
): number | undefined => {
	const statuses = Object.keys(getRouteResponses(route))
		.map(Number)
		.filter((status) => status >= 200 && status < 300);

	return statuses.length === 1 ? statuses[0] : undefined;
};

const hasDeclaredStatus = (route: HttpRouteDeclaration, status: number) =>
	Boolean(getResponseSchema(route, status));

const normalizeHandlerResultEnvelope = (
	route: HttpRouteDeclaration,
	result: unknown,
): {
	status: number;
	body: unknown;
	headers?: HttpHeaders;
	responseHeaders?: Record<string, unknown>;
} => {
	if (
		result &&
		typeof result === "object" &&
		"status" in result &&
		typeof result.status === "number" &&
		hasDeclaredStatus(route, result.status)
	) {
		return result as {
			status: number;
			body: unknown;
			headers?: HttpHeaders;
			responseHeaders?: Record<string, unknown>;
		};
	}

	const status = getSingleSuccessfulStatus(route);
	if (status === undefined) {
		throw new Error(
			`Service for "${route.method} ${route.path}" must return a declared response object.`,
		);
	}

	return {
		status,
		body: result,
	};
};

const validateOutgoingResponse = async (
	schema: ResponseBodySchema | undefined,
	body: unknown,
): Promise<unknown> => {
	if (!schema || isNoBody(schema) || isStream(schema)) {
		return body;
	}

	if (isCustomBody(schema)) {
		const validation = await validateStandardSchema(schema.schema, body);
		if (validation.issues) throw validation.issues;
		return validation.value;
	}

	const validation = await validateStandardSchema(schema, body);
	if (validation.issues) throw validation.issues;
	return validation.value;
};

type DeclaredResponseHeaderValue = string | number;

const isDeclaredResponseHeaderValue = (
	value: unknown,
): value is DeclaredResponseHeaderValue =>
	typeof value === "string" || typeof value === "number";

const assertNoHeaderConflicts = (
	declared: HttpHeaders,
	raw: HttpHeaders | undefined,
) => {
	if (!raw) return;

	const rawHeaderNames = new Set(
		Object.keys(raw).map((name) => name.toLowerCase()),
	);
	for (const name of Object.keys(declared)) {
		if (!rawHeaderNames.has(name.toLowerCase())) continue;

		throw new Error(`Response header "${name}" was returned more than once.`);
	}
};

const validateOutgoingResponseHeaders = async (
	schema: ResponseDeclaration | undefined,
	headers: Record<string, unknown> | undefined,
): Promise<HttpHeaders | undefined> => {
	if (!schema) return undefined;

	const declaredHeaders = getResponseHeaders(schema);
	if (!declaredHeaders) return undefined;

	const normalized: HttpHeaders = {};
	for (const [name, headerSchema] of Object.entries(declaredHeaders)) {
		const result = await validateStandardSchema(headerSchema, headers?.[name]);
		if (result.issues) throw result.issues;
		if (result.value === undefined) continue;

		if (!isDeclaredResponseHeaderValue(result.value)) {
			throw new Error(
				`Declared response header "${name}" must resolve to a string or number.`,
			);
		}

		normalized[name] = result.value;
	}

	return normalized;
};

const mergeResponseHeaders = (
	declared: HttpHeaders | undefined,
	raw: HttpHeaders | undefined,
): HttpHeaders | undefined => {
	if (!declared || Object.keys(declared).length === 0) return raw;
	assertNoHeaderConflicts(declared, raw);
	return { ...raw, ...declared };
};

const normalizeContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase();

const getDeclaredContentType = (
	contentTypes: readonly string[],
	contentType: string,
) => {
	const normalized = normalizeContentType(contentType);
	return contentTypes.find(
		(value) => normalizeContentType(value) === normalized,
	);
};

const resolveCustomBodyResult = (
	schema: CustomBody,
	body: unknown,
	errorMessage: string,
): { contentType: string; payload: unknown } => {
	if (!Array.isArray(schema.contentType)) {
		return { contentType: schema.contentType as string, payload: body };
	}

	const input = body as { contentType?: unknown; payload?: unknown };
	const contentType =
		typeof input.contentType === "string"
			? getDeclaredContentType(schema.contentType, input.contentType)
			: undefined;

	if (!contentType) throw new Error(errorMessage);

	return {
		contentType,
		payload: input.payload,
	};
};

const normalizeCustomBodyResult = async (schema: CustomBody, body: unknown) => {
	const result = resolveCustomBodyResult(
		schema,
		body,
		"Unsupported custom response body contentType.",
	);

	return {
		contentType: result.contentType,
		body: await validateOutgoingResponse(schema, result.payload),
	};
};

async function* validateStreamChunks(
	body: AsyncIterable<unknown>,
	schema: ResponseBodySchema,
) {
	if (!isStream(schema)) {
		yield* body;
		return;
	}

	for await (const chunk of body) {
		const chunkSchema = isCustomBody(schema.schema)
			? schema.schema.schema
			: schema.schema;
		const validation = await validateStandardSchema(chunkSchema, chunk);
		if (validation.issues) {
			throw new Error("Stream response validation failed.", {
				cause: validation.issues,
			});
		}
		yield validation.value;
	}
}

const normalizeResponseResult = async (
	route: HttpRouteDeclaration,
	result: {
		status: number;
		body: unknown;
		headers?: HttpHeaders;
		responseHeaders?: Record<string, unknown>;
	},
): Promise<HttpRouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const bodySchema = schema ? getResponseBody(schema) : undefined;
	const declaredHeaders = await validateOutgoingResponseHeaders(
		schema,
		result.responseHeaders,
	);
	const headers = mergeResponseHeaders(declaredHeaders, result.headers);

	if (bodySchema && isNoBody(bodySchema)) {
		return {
			kind: "empty",
			status: result.status,
			headers,
		};
	}

	if (bodySchema && isStream(bodySchema)) {
		if (isCustomBody(bodySchema.schema)) {
			const streamResult = resolveCustomBodyResult(
				bodySchema.schema,
				result.body,
				"Unsupported custom stream response contentType.",
			);

			return {
				kind: "stream",
				status: result.status,
				headers,
				contentType: streamResult.contentType,
				body: validateStreamChunks(
					streamResult.payload as AsyncIterable<unknown>,
					bodySchema,
				),
			};
		}

		return {
			kind: "stream",
			status: result.status,
			headers,
			body: validateStreamChunks(
				result.body as AsyncIterable<unknown>,
				bodySchema,
			),
		};
	}

	if (bodySchema && isCustomBody(bodySchema)) {
		const customResult = await normalizeCustomBodyResult(
			bodySchema,
			result.body,
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
		body: await validateOutgoingResponse(bodySchema, result.body),
	};
};

const normalizeServerErrorResponse = (
	response: ServerErrorResponse,
): HttpRouteResult => {
	if (response.body === undefined) {
		return {
			kind: "empty",
			status: response.status,
			headers: response.headers,
		};
	}

	return {
		kind: "json",
		status: response.status,
		headers: response.headers,
		body: response.body,
	};
};

const defaultResponseValidationErrorResponse: ServerErrorResponse = {
	status: 500,
	body: {
		message: "Response validation failed.",
	},
};

const handleResponseValidationError = async <
	TContext extends HttpRouteHandlerContext,
>(
	error: unknown,
	route: HttpRouteDeclaration,
	options: HandleHttpRouteOptions<TContext>,
	errorContext: TContext,
) => {
	const input = {
		route,
		request: options.request,
		context: errorContext,
		error,
	};
	const response =
		(await options.errorHandlers?.onResponseValidationError?.(input)) ??
		defaultResponseValidationErrorResponse;

	return normalizeServerErrorResponse(response);
};

const normalizeHandlerResult = async <TContext extends HttpRouteHandlerContext>(
	route: HttpRouteDeclaration,
	result: unknown,
	options: HandleHttpRouteOptions<TContext>,
	errorContext: TContext,
): Promise<HttpRouteResult> => {
	try {
		return await normalizeResponseResult(
			route,
			normalizeHandlerResultEnvelope(route, result),
		);
	} catch (error) {
		return handleResponseValidationError(error, route, options, errorContext);
	}
};

const normalizeRouteResponseError = async <
	TContext extends HttpRouteHandlerContext,
>(
	route: HttpRouteDeclaration,
	error: RouteResponseError,
	options: HandleHttpRouteOptions<TContext>,
	errorContext: TContext,
): Promise<HttpRouteResult> => {
	try {
		return await normalizeResponseResult(route, {
			status: error.status,
			body: error.body,
			responseHeaders: error.responseHeaders,
		});
	} catch (responseError) {
		return handleResponseValidationError(
			responseError,
			route,
			options,
			errorContext,
		);
	}
};

export const handleHttpRoute = async <
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
>(
	route: E,
	handler: RuntimeRouteHandler,
	options: HandleHttpRouteOptions<TContext>,
): Promise<HttpRouteResult> => {
	const requestValidation = await validateRequest(route, options.request);
	const errorContext = (options.errorContext ?? options.context) as TContext;

	if (!requestValidation.success) {
		const response =
			(await options.errorHandlers?.onRequestValidationError?.({
				route,
				request: options.request,
				context: errorContext,
				issues: requestValidation.response.body.validationErrors,
			})) ?? requestValidation.response;

		return normalizeServerErrorResponse(response);
	}

	try {
		const handlerResult = await handler({
			...requestValidation.data,
			[REQUEST_CONTEXT_KEY]: options.context,
		});

		return normalizeHandlerResult(route, handlerResult, options, errorContext);
	} catch (error) {
		if (error instanceof RouteResponseError) {
			return normalizeRouteResponseError(route, error, options, errorContext);
		}

		const unhandledErrorResponse =
			await options.errorHandlers?.onUnhandledError?.({
				route,
				request: options.request,
				context: errorContext,
				error,
			});

		if (unhandledErrorResponse) {
			return normalizeServerErrorResponse(unhandledErrorResponse);
		}

		throw error;
	}
};
