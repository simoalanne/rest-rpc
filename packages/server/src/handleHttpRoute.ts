import type { HttpRouteResult } from "./httpRouteResult.ts";
import {
	normalizeImplicitResponse,
	isCustomProcedureOutput,
} from "./implicitResponse.ts";
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
import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";
import type { RuntimeImplementation } from "./match.ts";
import {
	type RequestSegments,
	validateRequestSegments,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { invokeWithMiddleware } from "./middleware.ts";
import { frameSseStream } from "./sse.ts";
import { createContext } from "./context.ts";

/** Shared configuration options passed to the `handleHttpRoute` function. */
export type HandleHttpRouteConfiguration = {
	/**
	 * When set to `true`, disables request schema validation. Validation errors
	 * will not be thrown, and the handler will receive the raw request segments.
	 * The schemas are still used for type inference and OpenAPI generation.
	 *
	 * @remarks Do not disable request validation if you are using schemas that
	 * transform or coerce values, as those transformations will not be applied to
	 * the request segments. See {@link https://rest-rpc.dev/docs/http-behavior/schemas#disabling-server-validation}.
	 *
	 * @default false
	 */
	disableRequestValidation?: boolean;
	/**
	 * When set to `true`, disables response schema validation. Validation errors
	 * will not be thrown, and the handler's output will be returned as-is.
	 * The schemas are still used for type inference and OpenAPI generation.
	 *
	 * @remarks Do not disable response validation if you are using schemas that
	 * transform or coerce values, as those transformations will not be applied to
	 * the response body. See {@link https://rest-rpc.dev/docs/http-behavior/schemas#disabling-server-validation}.
	 *
	 * @default false
	 */
	disableResponseValidation?: boolean;
};

/** Inputs needed to invoke and normalize one HTTP route handler. */
export type HandleHttpRouteOptions<
	TAdditionalHandlerFields extends object = Record<never, never>,
> = {
	request: RequestSegments;
	handlerFields: TAdditionalHandlerFields;
	configuration?: HandleHttpRouteConfiguration;
};

const requestHeader = (headers: RequestSegments["headers"], name: string) => {
	const value = headers?.[name];
	return Array.isArray(value) ? value[0] : value;
};

const usesPlainOutput = (route: RouteDeclaration) =>
	route.output === "output" ||
	(route.output === undefined && route.kind === "procedure");

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
	disableValidation: boolean,
): Promise<HttpRouteResult> => {
	const schema = getResponseSchema(route, result.status);
	const bodySchema = schema.body;
	const headers = disableValidation
		? schema.headers
			? Object.fromEntries(
					Object.entries(result.responseHeaders ?? {}).flatMap(
						([name, value]) =>
							value === undefined ? [] : [[name, String(value)]],
					),
				)
			: undefined
		: await validateResponseHeaders(schema, result.responseHeaders);

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
			body: frameSseStream(
				disableValidation
					? (result.body as AsyncIterable<unknown>)
					: validateResponseStreamChunks(
							result.body as AsyncIterable<unknown>,
							bodySchema,
						),
			),
		};
	}

	return {
		kind: "response",
		status: result.status,
		headers,
		body: {
			value: disableValidation
				? result.body
				: await validateResponseBody(bodySchema, result.body),
			contentType: selectResponseContentType(
				schema.contentType ?? "application/json",
				result.contentType,
			),
		},
	};
};

const getHandlerRequestFields = (
	route: RouteDeclaration,
	segments: {
		body?: unknown;
		query?: unknown;
		params?: unknown;
		headers?: unknown;
	},
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
>(
	implementation: RuntimeImplementation,
	options: HandleHttpRouteOptions<TAdditionalHandlerFields>,
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
			? options.request
			: await validateRequestSegments(route, options.request);
		const disableResponseValidation =
			options.configuration?.disableResponseValidation ?? false;

		const handlerResult = await invokeWithMiddleware(
			implementation.middleware ?? [],
			handler,
			{
				...getHandlerRequestFields(route, validatedRequest),
				...options.handlerFields,
				context: createContext(),
				contentType,
				lastEventId,
				route,
			},
		);

		const hasDeclaredResponses = Object.keys(route.responses).length > 0;
		if (!hasDeclaredResponses) {
			return normalizeImplicitResponse(handlerResult);
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
				return await normalizeResponseResult(
					route,
					{
						status: 200,
						body: handlerResult.data,
						contentType: handlerResult.contentType,
					},
					disableResponseValidation,
				);
			}

			return await normalizeResponseResult(
				route,
				{
					status: 200,
					body: handlerResult,
				},
				disableResponseValidation,
			);
		}

		return await normalizeResponseResult(
			route,
			handlerResult as DeclaredResponseEnvelope,
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
