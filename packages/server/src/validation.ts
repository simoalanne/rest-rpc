import {
	type ResponseBodySchema,
	type ResponseDeclaration,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	type StandardSchemaV1,
	validateStandardSchema,
} from "@rest-rpc/core/standard-schema";
import type { HttpHeaders } from "./headers.ts";
import {
	ResponseValidationError,
	RequestValidationError,
} from "./validationErrors.ts";

/**
 * A Standard Schema validation issue surfaced by server request validation.
 *
 * @see {@link https://rest-rpc.dev/docs/http-behavior/schemas#request-validation}
 */
export type ValidationIssue = StandardSchemaV1.Issue;

/**
 * Parsed request pieces passed into server request validation.
 */
export type RequestSegments = {
	body?: unknown;
	query?: URLSearchParams;
	params?: unknown;
	headers?: unknown;
};

type SegmentValidationResult = {
	data: unknown;
	errors: readonly StandardSchemaV1.Issue[];
};

type RequestObjectSchema = StandardSchemaV1<unknown, unknown>;

const parseQuery = (searchParams: URLSearchParams) => {
	const data: Record<string, unknown> = {};

	for (const [wireKey, value] of searchParams) {
		if (wireKey.endsWith("[]")) {
			const key = wireKey.slice(0, -2);
			const current = data[key];
			data[key] = Array.isArray(current) ? [...current, value] : [value];
			continue;
		}

		data[wireKey] = value;
	}

	return data;
};

const validateRequestSegment = async (
	schema: RequestObjectSchema | undefined,
	input: unknown,
): Promise<SegmentValidationResult> => {
	if (!schema) return { data: undefined, errors: [] };
	const result = await validateStandardSchema(schema, input);
	if (result.issues) {
		return { data: undefined, errors: result.issues };
	}
	return { data: result.value, errors: [] };
};

const validateRequestQuery = async (
	schema: RequestObjectSchema | undefined,
	query: URLSearchParams | undefined,
): Promise<SegmentValidationResult> => {
	return validateRequestSegment(schema, query ? parseQuery(query) : undefined);
};

export async function validateRequestSegments(
	route: RouteDeclaration,
	segments: RequestSegments,
) {
	const requestSchemas = route.request;
	const body = await validateRequestSegment(
		requestSchemas?.body,
		segments.body,
	);
	const query = await validateRequestQuery(
		requestSchemas?.query,
		segments.query,
	);
	const params = await validateRequestSegment(
		requestSchemas?.params,
		segments.params,
	);
	const headers = await validateRequestSegment(
		requestSchemas?.headers,
		segments.headers,
	);
	const issues = {
		body: body.errors,
		query: query.errors,
		params: params.errors,
		headers: headers.errors,
	};
	if (Object.values(issues).some((errors) => errors.length > 0)) {
		throw new RequestValidationError(issues);
	}
	return {
		body: body.data,
		query: query.data,
		params: params.data,
		headers: headers.data,
	};
}

export const validateResponseBody = async (
	schema: ResponseBodySchema | undefined,
	body: unknown,
): Promise<unknown> => {
	if (!schema) {
		return body;
	}

	const validation = await validateStandardSchema(schema, body);
	if (validation.issues) {
		throw new ResponseValidationError("body", validation.issues);
	}
	return validation.value;
};

export const validateResponseHeaders = async (
	schema: ResponseDeclaration | undefined,
	headers: Record<string, unknown> | undefined,
): Promise<HttpHeaders | undefined> => {
	if (!schema) return undefined;

	const declaredHeaders = schema.headers;
	if (!declaredHeaders) return undefined;

	const result = await validateStandardSchema(declaredHeaders, headers ?? {});
	if (result.issues) {
		throw new ResponseValidationError("headers", result.issues);
	}

	return Object.fromEntries(
		Object.entries(result.value).flatMap(([name, value]) =>
			value === undefined ? [] : [[name, String(value)]],
		),
	);
};

export const validateResponseStreamChunk = async (
	schema: ResponseBodySchema | undefined,
	chunk: unknown,
) => {
	if (!schema) return chunk;

	const validation = await validateStandardSchema(schema, chunk);
	if (validation.issues) {
		throw new ResponseValidationError("stream", validation.issues);
	}
	return validation.value;
};

export async function* validateResponseStreamChunks(
	body: AsyncIterable<unknown>,
	schema: ResponseBodySchema,
) {
	for await (const chunk of body) {
		yield await validateResponseStreamChunk(schema, chunk);
	}
}
