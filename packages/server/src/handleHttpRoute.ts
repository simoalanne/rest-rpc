import type {
	CustomBody,
	HttpRouteDeclaration,
	ResponseDeclaration,
} from "@rest-rpc/core/contract";
import {
	getResponseBody,
	getRouteResponses,
	isCustomBody,
	isNoBody,
	isStream,
	REQUEST_CONTEXT_KEY,
} from "@rest-rpc/core/contract";
import type {
	ServerErrorHandlers,
	ServerErrorResponse,
} from "./errorHandlers.ts";
import type { HttpHeaders } from "./headers.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import type { HttpRouteHandlerContext, RuntimeRouteHandler } from "./router.ts";
import {
	type RequestSegments,
	resolveCustomResponseBody,
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
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#writing-the-result}
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
			contentType?: string;
	  });

/**
 * Inputs needed to invoke and normalize one HTTP route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registering-http-routes}
 */
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

const mergeResponseHeaders = (
	declared: HttpHeaders | undefined,
	raw: HttpHeaders | undefined,
): HttpHeaders | undefined => {
	if (!declared || Object.keys(declared).length === 0) return raw;
	assertNoHeaderConflicts(declared, raw);
	return { ...raw, ...declared };
};

const normalizeCustomBodyResult = async (schema: CustomBody, body: unknown) => {
	const result = resolveCustomResponseBody(
		schema,
		body,
		"Unsupported custom response body contentType.",
	);

	return {
		contentType: result.contentType,
		body: await validateResponseBody(schema, result.payload),
	};
};

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
	const declaredHeaders = await validateResponseHeaders(
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
			const streamResult = resolveCustomResponseBody(
				bodySchema.schema,
				result.body,
				"Unsupported custom stream response contentType.",
			);

			return {
				kind: "stream",
				status: result.status,
				headers,
				contentType: streamResult.contentType,
				body: validateResponseStreamChunks(
					streamResult.payload as AsyncIterable<unknown>,
					bodySchema,
				),
			};
		}

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
		body: await validateResponseBody(bodySchema, result.body),
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

/**
 * Validates an HTTP request, invokes a route handler, and normalizes its result.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registering-http-routes}
 */
export async function handleHttpRoute<
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
>(
	route: E,
	handler: RuntimeRouteHandler,
	options: HandleHttpRouteOptions<TContext>,
): Promise<HttpRouteResult> {
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
}
