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
import type { HttpHeaders } from "./headers.ts";
import { flattenRequestData } from "./requestData.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import { RequestValidationError } from "./validationErrors.ts";
import type {
	HttpRouteHandlerContext,
	RuntimeRouteHandler,
	ServerHttpRouteDeclaration,
} from "./router.ts";
import type { BaseRouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplicitResponseEnvelope } from "./serverFirst.ts";
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
	responseKindMetadata?: boolean;
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
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
	value !== null &&
	(typeof value === "object" || typeof value === "function") &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";

const classifyImplicitResponse = (
	result: ImplicitResponseEnvelope,
): HttpRouteResult => {
	if (!("body" in result)) {
		return { kind: "empty", status: result.status };
	}

	const body = result.body;
	const { contentType } = result;

	if (isAsyncIterable(body)) {
		return {
			kind: "stream",
			status: result.status,
			body,
			...(contentType !== undefined
				? { contentType, mode: "raw" as const }
				: { mode: "ndjson" as const }),
		};
	}

	if (contentType !== undefined) {
		return { kind: "custom", status: result.status, body, contentType };
	}

	return { kind: "json", status: result.status, body };
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

const normalizeHandlerResult = async (
	route: ServerHttpRouteDeclaration,
	result: unknown,
): Promise<HttpRouteResult> => {
	if (route.mode === "sse") return normalizeSseResponseResult(route, result);

	return normalizeResponseResult(
		route,
		normalizeHandlerResultEnvelopeOrShorthand(route, result),
	);
};

const normalizeRouteResponseError = async (
	route: ServerHttpRouteDeclaration,
	error: RouteResponseError,
): Promise<HttpRouteResult> => {
	return normalizeResponseResult(route, {
		status: error.status,
		body: error.body,
		responseHeaders: error.responseHeaders,
	});
};

/**
 * Validates an HTTP request, invokes a route handler, and normalizes its result.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registering-http-routes}
 */
export async function handleHttpRoute<
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
>(
	route: BaseRouteDeclaration,
	handler: RuntimeRouteHandler,
	options: HandleHttpRouteOptions<TContext>,
): Promise<HttpRouteResult> {
	const declaredRoute = route as ServerHttpRouteDeclaration;
	const requestValidation = await validateRequest(
		declaredRoute,
		options.request,
	);
	if (!requestValidation.success) {
		throw new RequestValidationError(requestValidation.issues);
	}

	let handlerResult: unknown;
	try {
		handlerResult = await handler({
			...flattenRequestData(declaredRoute, requestValidation.data),
			[REQUEST_CONTEXT_KEY]:
				declaredRoute.mode === "sse"
					? {
							...options.context,
							lastEventId: getHeaderValue(
								options.request.headers,
								"last-event-id",
							),
						}
					: options.context,
		});
	} catch (error) {
		if (error instanceof RouteResponseError) {
			return normalizeRouteResponseError(declaredRoute, error);
		}
		throw error;
	}

	if (!("responses" in declaredRoute)) {
		return classifyImplicitResponse(handlerResult as ImplicitResponseEnvelope);
	}

	return normalizeHandlerResult(declaredRoute, handlerResult);
}
