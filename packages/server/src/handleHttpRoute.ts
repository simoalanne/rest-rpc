import { validateStandardSchemaSync } from "@contract-first-api/core";
import type {
	HttpRouteDeclaration,
	ResponseBodySchema,
} from "@contract-first-api/core/contract";
import { REQUEST_CONTEXT_KEY } from "@contract-first-api/core/contract";
import type { HttpHeaders } from "./headers.ts";
import {
	ContractResponseError,
	getResponseSchema,
	isEmptyResponseSchema,
	isStreamingResponseSchema,
	normalizeHandlerResult,
} from "./response.ts";
import type { HttpRouteHandlerContext, RuntimeRouteHandler } from "./router.ts";
import {
	type RequestSegments,
	type ValidationIssue,
	validateRequestSegments,
} from "./validation.ts";

type HttpRouteResultBase = {
	status: number;
	headers?: HttpHeaders;
};

export type HttpRouteResult =
	| (HttpRouteResultBase & { kind: "empty" })
	| (HttpRouteResultBase & { kind: "json"; body: unknown })
	| (HttpRouteResultBase & { kind: "stream"; body: AsyncIterable<unknown> });

export type HandleHttpRouteOptions<TContext extends HttpRouteHandlerContext> = {
	request: RequestSegments;
	context: TContext;
};

const requestValidationErrorResult = (
	errors: ValidationIssue[],
): HttpRouteResult => ({
	kind: "json",
	status: 400,
	body: {
		message:
			"Request validation failed. Check the validationErrors field for details.",
		validationErrors: errors,
	},
});

const validateOutgoingResponse = (
	schema: ResponseBodySchema | undefined,
	body: unknown,
) => {
	if (
		!schema ||
		isEmptyResponseSchema(schema) ||
		isStreamingResponseSchema(schema)
	) {
		return body;
	}

	const validation = validateStandardSchemaSync(schema, body);
	if (validation.issues) throw validation.issues;
	return validation.value;
};

async function* validateStreamChunks(
	body: AsyncIterable<unknown>,
	schema: ResponseBodySchema,
) {
	if (!isStreamingResponseSchema(schema)) {
		yield* body;
		return;
	}

	for await (const chunk of body) {
		const validation = validateStandardSchemaSync(schema.schema, chunk);
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

	if (schema && isEmptyResponseSchema(schema)) {
		return {
			kind: "empty",
			status: result.status,
			headers: result.headers,
		};
	}

	if (schema && isStreamingResponseSchema(schema)) {
		return {
			kind: "stream",
			status: result.status,
			headers: result.headers,
			body: validateStreamChunks(result.body as AsyncIterable<unknown>, schema),
		};
	}

	return {
		kind: "json",
		status: result.status,
		headers: result.headers,
		body: validateOutgoingResponse(schema, result.body),
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
	const requestValidation = validateRequestSegments(route, options.request);

	if (!requestValidation.success) {
		return requestValidationErrorResult(requestValidation.errors);
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

		throw error;
	}
};
