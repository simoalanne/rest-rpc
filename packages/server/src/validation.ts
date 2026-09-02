import {
	type CustomBody,
	type FormBody,
	getResponseHeaders,
	isCustomBody,
	isFormBody,
	isJsonQuery,
	isMultipartBody,
	isNoBody,
	getRequestHeaderSchemas,
	isStream,
	type JsonQuery,
	type MultipartBody,
	type ResponseBodySchema,
	type ResponseDeclaration,
	type RouteDeclaration,
	type RequestHeadersDeclaration,
} from "@rest-rpc/core/contract";
import {
	isStandardSchema,
	type StandardSchemaV1,
	validateStandardSchema,
} from "@rest-rpc/core/standard-schema";
import type { HttpHeaders } from "./headers.ts";

/**
 * A Standard Schema validation issue surfaced by server request validation.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/schemas#validation}
 */
export type ValidationIssue = StandardSchemaV1.Issue;

export type RequestValidationFailure = {
	status: 400;
	body: {
		message: string;
		validationErrors: ValidationIssue[];
	};
};

export type RequestValidationResponse =
	| { success: true; data: Record<string, unknown> }
	| { success: false; response: RequestValidationFailure };

/**
 * Parsed request pieces passed into server request validation.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#registering-http-routes}
 */
export type RequestSegments = {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
};

type SegmentValidationResult = {
	data: unknown;
	errors: readonly StandardSchemaV1.Issue[];
};

type RequestObjectSchema = StandardSchemaV1<unknown, unknown>;

const parseJsonQuery = (value: unknown) => {
	if (Array.isArray(value)) value = value[0];
	if (value === undefined) return undefined;
	if (typeof value !== "string") return value;
	return JSON.parse(value);
};

export const getHeaderValue = (
	headers: unknown,
	name: string,
): string | undefined => {
	if (typeof headers !== "object" || headers === null) return undefined;

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== name) continue;
		if (Array.isArray(value)) return String(value[0]);
		if (value === undefined) return undefined;
		return String(value);
	}

	return undefined;
};

const validateObjectSchema = async (
	schema: RequestObjectSchema,
	input: unknown,
): Promise<SegmentValidationResult> => {
	const result = await validateStandardSchema(schema, input);
	if (result.issues) {
		return { data: {}, errors: result.issues };
	}

	return { data: result.value, errors: [] };
};

const validateRequestObject = async (
	declaration: unknown,
	input: unknown,
): Promise<SegmentValidationResult> => {
	if (isStandardSchema(declaration)) {
		return validateObjectSchema(declaration as RequestObjectSchema, input);
	}

	return { data: {}, errors: [] };
};

const validateHeaders = async (
	declaration: RequestHeadersDeclaration | undefined,
	input: unknown,
): Promise<SegmentValidationResult> => {
	if (!declaration) return { data: {}, errors: [] };

	const data: Record<string, unknown> = {};
	const errors: StandardSchemaV1.Issue[] = [];
	for (const schema of getRequestHeaderSchemas(declaration)) {
		const result = await validateStandardSchema(schema, input);
		if (result.issues) errors.push(...result.issues);
		else Object.assign(data, result.value);
	}

	return { data, errors };
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

const validateCustomBody = async (
	route: RouteDeclaration,
	body: unknown,
	headers: unknown,
): Promise<SegmentValidationResult> => {
	const declaration = route.request?.body;
	if (!isCustomBody(declaration)) return { data: {}, errors: [] };
	const contentTypes = Array.isArray(declaration.contentType)
		? declaration.contentType
		: undefined;
	const contentType =
		contentTypes && body !== undefined
			? getHeaderValue(headers, "content-type")
			: undefined;
	const declaredContentType =
		contentTypes && typeof contentType === "string"
			? getDeclaredContentType(contentTypes, contentType)
			: undefined;

	if (contentTypes && !declaredContentType) {
		return {
			data: {},
			errors: [{ message: "Unsupported custom body contentType." }],
		};
	}

	const result = await validateStandardSchema(declaration.schema, body);
	if (result.issues) {
		return { data: {}, errors: result.issues };
	}

	return {
		data: {
			body: contentTypes
				? {
						contentType: declaredContentType,
						payload: result.value,
					}
				: result.value,
		},
		errors: [],
	};
};

const formBodyToObject = (
	body: URLSearchParams,
	arrayKeys: readonly string[],
) => {
	const data: Record<string, string | string[]> = {};
	const arrayKeySet = new Set(arrayKeys);
	for (const key of new Set(body.keys())) {
		if (arrayKeySet.has(key)) {
			data[key] = body.getAll(key);
			continue;
		}

		const value = body.get(key);
		if (value !== null) data[key] = value;
	}
	return data;
};

const validateFormBody = async (
	declaration: FormBody,
	body: unknown,
): Promise<SegmentValidationResult> => {
	if (!(body instanceof URLSearchParams)) {
		return {
			data: {},
			errors: [{ message: "Expected URLSearchParams form body." }],
		};
	}

	const result = await validateStandardSchema(
		declaration.schema,
		formBodyToObject(body, declaration.arrayKeys),
	);
	if (result.issues) {
		return { data: {}, errors: result.issues };
	}

	return { data: { body: result.value }, errors: [] };
};

const multipartBodyToObject = (
	body: FormData,
	arrayKeys: readonly string[],
) => {
	const data: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
	const arrayKeySet = new Set(arrayKeys);
	for (const key of new Set(body.keys())) {
		if (arrayKeySet.has(key)) {
			data[key] = body.getAll(key);
			continue;
		}

		const value = body.get(key);
		if (value !== null) data[key] = value;
	}
	return data;
};

const validateMultipartBody = async (
	declaration: MultipartBody,
	body: unknown,
): Promise<SegmentValidationResult> => {
	if (!(body instanceof FormData)) {
		return {
			data: {},
			errors: [{ message: "Expected FormData multipart body." }],
		};
	}

	const result = await validateStandardSchema(
		declaration.schema,
		multipartBodyToObject(body, declaration.arrayKeys),
	);
	if (result.issues) {
		return { data: {}, errors: result.issues };
	}

	return { data: { body: result.value }, errors: [] };
};

const validateJsonQuery = async (
	declaration: JsonQuery,
	query: unknown,
): Promise<SegmentValidationResult> => {
	let input: unknown;
	try {
		input = parseJsonQuery(
			typeof query === "object" && query !== null
				? (query as Record<string, unknown>).query
				: undefined,
		);
	} catch {
		return {
			data: {},
			errors: [{ message: 'Invalid JSON query parameter "query".' }],
		};
	}

	const result = await validateStandardSchema(declaration.schema, input);
	if (result.issues) {
		return { data: {}, errors: result.issues };
	}

	return { data: { query: result.value }, errors: [] };
};

const getValidatedRequestData = (
	route: RouteDeclaration,
	body: SegmentValidationResult,
	query: SegmentValidationResult,
	params: SegmentValidationResult,
	headers: SegmentValidationResult,
) => {
	const request = route.request;
	return {
		...(request?.body && !isNoBody(request.body)
			? {
					body:
						isCustomBody(request.body) ||
						isFormBody(request.body) ||
						isMultipartBody(request.body)
							? (body.data as Record<string, unknown>).body
							: body.data,
				}
			: {}),
		...(request?.query
			? {
					query: isJsonQuery(request.query)
						? (query.data as Record<string, unknown>).query
						: query.data,
				}
			: {}),
		...(request?.params ? { params: params.data } : {}),
		...(request?.headers ? { headers: headers.data } : {}),
	};
};

export async function validateRequest(
	route: RouteDeclaration,
	segments: RequestSegments,
): Promise<RequestValidationResponse> {
	const request = route.request;
	const body = isCustomBody(request?.body)
		? await validateCustomBody(route, segments.body, segments.headers)
		: isFormBody(request?.body)
			? await validateFormBody(request.body, segments.body)
			: isMultipartBody(request?.body)
				? await validateMultipartBody(request.body, segments.body)
				: await validateRequestObject(request?.body, segments.body);
	const query = isJsonQuery(request?.query)
		? await validateJsonQuery(request.query, segments.query)
		: await validateRequestObject(request?.query, segments.query);
	const params = await validateRequestObject(request?.params, segments.params);
	const headers = await validateHeaders(request?.headers, segments.headers);
	const errors = [
		...body.errors,
		...query.errors,
		...params.errors,
		...headers.errors,
	];

	if (errors.length === 0) {
		return {
			success: true,
			data: getValidatedRequestData(route, body, query, params, headers),
		};
	}

	return {
		success: false,
		response: {
			status: 400,
			body: {
				message:
					"Request validation failed. Check the validationErrors field for details.",
				validationErrors: errors,
			},
		},
	};
}

export const validateResponseBody = async (
	schema: ResponseBodySchema | CustomBody | undefined,
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

export const validateResponseHeaders = async (
	schema: ResponseDeclaration | undefined,
	headers: Record<string, unknown> | undefined,
): Promise<HttpHeaders | undefined> => {
	if (!schema) return undefined;

	const declaredHeaders = getResponseHeaders(schema);
	if (!declaredHeaders) return undefined;

	const result = await validateStandardSchema(declaredHeaders, headers ?? {});
	if (result.issues) throw result.issues;

	return Object.fromEntries(
		Object.entries(result.value).flatMap(([name, value]) =>
			value === undefined ? [] : [[name, String(value)]],
		),
	);
};

export const resolveCustomResponseBody = (
	schema: CustomBody,
	body: unknown,
	errorMessage: string,
): { contentType: string; payload: unknown } => {
	if (!Array.isArray(schema.contentType)) {
		if (!schema.contentType) throw new Error(errorMessage);
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

export const validateResponseStreamChunk = async (
	schema: ResponseBodySchema | undefined,
	chunk: unknown,
) => {
	if (!schema || !isStream(schema)) {
		return validateResponseBody(schema, chunk);
	}

	const chunkSchema = isCustomBody(schema.schema)
		? schema.schema.schema
		: schema.schema;
	const validation = await validateStandardSchema(chunkSchema, chunk);
	if (validation.issues) {
		throw new Error("Stream response validation failed.", {
			cause: validation.issues,
		});
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
