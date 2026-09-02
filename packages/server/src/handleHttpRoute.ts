import type {
	CustomBody,
	ResponseDeclaration,
	SseRouteDeclaration,
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
import { flattenRequestData } from "./requestData.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import type {
	HttpRouteHandlerContext,
	RuntimeRouteHandler,
	ServerHttpRouteDeclaration,
} from "./router.ts";
import { validateSseEvents } from "./sse.ts";
import {
	getHeaderValue,
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
 * Identifies how a stream route result should be written by an adapter.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#writing-the-result}
 */
export type HttpRouteResultStreamMode = "ndjson" | "raw" | "sse";

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
			mode?: HttpRouteResultStreamMode;
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
	route: ServerHttpRouteDeclaration,
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

const getSingleSuccessfulStatus = (
	route: ServerHttpRouteDeclaration,
): number | undefined => {
	const statuses = Object.keys(getRouteResponses(route))
		.map(Number)
		.filter((status) => status >= 200 && status < 300);

	return statuses.length === 1 ? statuses[0] : undefined;
};

const normalizeHandlerResultEnvelopeOrShorthand = (
	route: ServerHttpRouteDeclaration,
	result: unknown,
): {
	status: number;
	body: unknown;
	headers?: HttpHeaders;
	responseHeaders?: Record<string, unknown>;
} => {
	if (result && typeof result === "object" && "status" in result) {
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
	route: ServerHttpRouteDeclaration,
	result: {
		status: number;
		body: unknown;
		headers?: HttpHeaders;
		responseHeaders?: Record<string, unknown>;
	},
): Promise<HttpRouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const bodySchema = getResponseBody(schema);
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

const normalizeSseResponseResult = (
	route: SseRouteDeclaration,
	body: unknown,
): HttpRouteResult => {
	const status = getSingleSuccessfulStatus(route);
	if (status === undefined) {
		throw new Error(
			`Service for "${route.method} ${route.path}" must return a declared response object.`,
		);
	}

	const schema = getResponseSchema(route, status);
	const bodySchema = schema ? getResponseBody(schema) : undefined;

	return {
		kind: "stream",
		status,
		headers: {
			"cache-control": "no-cache",
			"x-accel-buffering": "no",
		},
		contentType: "text/event-stream",
		mode: "sse",
		body: validateSseEvents(body as AsyncIterable<unknown>, bodySchema),
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
	route: ServerHttpRouteDeclaration,
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
	route: ServerHttpRouteDeclaration,
	result: unknown,
	options: HandleHttpRouteOptions<TContext>,
	errorContext: TContext,
): Promise<HttpRouteResult> => {
	try {
		if (route.mode === "sse") return normalizeSseResponseResult(route, result);

		return await normalizeResponseResult(
			route,
			normalizeHandlerResultEnvelopeOrShorthand(route, result),
		);
	} catch (error) {
		return handleResponseValidationError(error, route, options, errorContext);
	}
};

const normalizeRouteResponseError = async <
	TContext extends HttpRouteHandlerContext,
>(
	route: ServerHttpRouteDeclaration,
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
	E extends ServerHttpRouteDeclaration,
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
			...flattenRequestData(route, requestValidation.data),
			[REQUEST_CONTEXT_KEY]:
				route.mode === "sse"
					? {
							...options.context,
							lastEventId: getHeaderValue(
								options.request.headers,
								"last-event-id",
							),
						}
					: options.context,
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
