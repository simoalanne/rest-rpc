import { validateStandardSchemaSync } from "@contract-first-api/core";
import type {
	HttpRouteDeclaration,
	ResponseBodySchema,
} from "@contract-first-api/core/contract";
import {
	isCustomBody,
	REQUEST_CONTEXT_KEY,
} from "@contract-first-api/core/contract";
import type { HttpHeaders } from "./headers.ts";
import {
	ContractResponseError,
	getResponseSchema,
	isEmptyResponseSchema,
	isStreamingResponseSchema,
	normalizeHandlerResult,
} from "./response.ts";
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
};

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
	if (!isStreamingResponseSchema(schema)) {
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

	if (schema && isEmptyResponseSchema(schema)) {
		return {
			kind: "empty",
			status: result.status,
			headers: result.headers,
		};
	}

	if (schema && isStreamingResponseSchema(schema)) {
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
		return {
			kind: "json",
			...requestValidation.response,
		};
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
