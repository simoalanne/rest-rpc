import { validateStandardSchemaSync } from "@rest-rpc/core";
import type {
	HttpRouteDeclaration,
	ResponseBodySchema,
} from "@rest-rpc/core/contract";
import {
	isCustomBody,
	isNoBody,
	isStream,
	REQUEST_CONTEXT_KEY,
} from "@rest-rpc/core/contract";
import { ContractResponseError } from "./contractResponseError.ts";
import type {
	ServerErrorHandlers,
	ServerErrorResponse,
} from "./errorHandlers.ts";
import type { HttpHeaders } from "./headers.ts";
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
	errorHandlers?: ServerErrorHandlers<TContext>;
};

const getResponseSchema = (
	route: HttpRouteDeclaration,
	status: number,
): ResponseBodySchema | undefined => {
	const entry = Object.entries(route.responses).find(
		([declaredStatus]) => Number(declaredStatus) === status,
	);
	return entry?.[1];
};

const getSingleSuccessfulStatus = (
	route: HttpRouteDeclaration,
): number | undefined => {
	const statuses = Object.keys(route.responses)
		.map(Number)
		.filter((status) => status >= 200 && status < 300);

	return statuses.length === 1 ? statuses[0] : undefined;
};

const hasDeclaredStatus = (route: HttpRouteDeclaration, status: number) =>
	Boolean(getResponseSchema(route, status));

const normalizeHandlerResult = (
	route: HttpRouteDeclaration,
	result: unknown,
): {
	status: number;
	body: unknown;
	headers?: HttpHeaders;
} => {
	if (
		result &&
		typeof result === "object" &&
		"status" in result &&
		typeof result.status === "number" &&
		hasDeclaredStatus(route, result.status)
	) {
		return result as { status: number; body: unknown };
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

const validateOutgoingResponse = (
	schema: ResponseBodySchema | undefined,
	body: unknown,
) => {
	if (!schema || isNoBody(schema) || isStream(schema)) {
		return body;
	}

	if (isCustomBody(schema)) {
		const validation = validateStandardSchemaSync(schema.schema, body);
		if (validation.issues) throw validation.issues;
		return validation.value;
	}

	const validation = validateStandardSchemaSync(schema, body);
	if (validation.issues) throw validation.issues;
	return validation.value;
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
		const validation = validateStandardSchemaSync(chunkSchema, chunk);
		if (validation.issues) throw validation.issues;
		yield validation.value;
	}
}

const normalizeResponseResult = (
	route: HttpRouteDeclaration,
	result: {
		status: number;
		body: unknown;
		headers?: HttpHeaders;
	},
): HttpRouteResult => {
	const schema = getResponseSchema(route, result.status);

	if (schema && isNoBody(schema)) {
		return {
			kind: "empty",
			status: result.status,
			headers: result.headers,
		};
	}

	if (schema && isStream(schema)) {
		if (isCustomBody(schema.schema)) {
			return {
				kind: "stream",
				status: result.status,
				headers: result.headers,
				contentType: schema.schema.contentType,
				body: validateStreamChunks(
					result.body as AsyncIterable<unknown>,
					schema,
				),
			};
		}

		return {
			kind: "stream",
			status: result.status,
			headers: result.headers,
			body: validateStreamChunks(result.body as AsyncIterable<unknown>, schema),
		};
	}

	if (schema && isCustomBody(schema)) {
		return {
			kind: "custom",
			status: result.status,
			headers: result.headers,
			contentType: schema.contentType,
			body: validateOutgoingResponse(schema, result.body),
		};
	}

	return {
		kind: "json",
		status: result.status,
		headers: result.headers,
		body: validateOutgoingResponse(schema, result.body),
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

export const handleHttpRoute = async <
	E extends HttpRouteDeclaration,
	TContext extends HttpRouteHandlerContext = HttpRouteHandlerContext,
>(
	route: E,
	handler: RuntimeRouteHandler,
	options: HandleHttpRouteOptions<TContext>,
): Promise<HttpRouteResult> => {
	const requestValidation = validateRequest(route, options.request);

	if (!requestValidation.success) {
		const response =
			(await options.errorHandlers?.onRequestValidationError?.({
				route,
				request: options.request,
				context: options.context,
				issues: requestValidation.response.body.validationErrors,
			})) ?? requestValidation.response;

		return normalizeServerErrorResponse(response);
	}

	try {
		const handlerResult = await handler({
			...requestValidation.data,
			[REQUEST_CONTEXT_KEY]: options.context,
		});
		return normalizeResponseResult(
			route,
			normalizeHandlerResult(route, handlerResult),
		);
	} catch (error) {
		if (error instanceof ContractResponseError) {
			return normalizeResponseResult(route, {
				status: error.status,
				body: error.body,
			});
		}

		const response = await options.errorHandlers?.onUnhandledError?.({
			route,
			request: options.request,
			context: options.context,
			error,
		});
		if (response) return normalizeServerErrorResponse(response);

		throw error;
	}
};
