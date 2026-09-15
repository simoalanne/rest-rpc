import {
	type BodyContentType,
	getRequestHeaderSchemas,
	type ResponseBodySchema,
	type ResponseDeclaration,
	type RouteDeclaration,
	type RequestHeadersDeclaration,
} from "@rest-rpc/core/contract";
import {
	type StandardSchemaV1,
	validateStandardSchema,
} from "@rest-rpc/core/standard-schema";
import type { HttpHeaders } from "./headers.ts";
import {
	ResponseValidationError,
	type RequestValidationIssues,
} from "./validationErrors.ts";

/**
 * A Standard Schema validation issue surfaced by server request validation.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/schemas#validation}
 */
export type ValidationIssue = StandardSchemaV1.Issue;

export type RequestValidationResponse =
	| { success: true; data: Record<string, unknown> }
	| {
			success: false;
			issues: RequestValidationIssues;
	  };

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

const parseQueryOrFormData = (searchParams: URLSearchParams | FormData) => {
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
	declaration: RequestObjectSchema | undefined,
	input: unknown,
): Promise<SegmentValidationResult> => {
	if (!declaration) return { data: {}, errors: [] };
	return validateObjectSchema(declaration, input);
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
	const declaration = route.request;
	if (!declaration?.body || declaration.contentType === undefined) {
		return { data: {}, errors: [] };
	}
	const contentTypes =
		declaration.contentType === undefined
			? undefined
			: Array.isArray(declaration.contentType)
				? declaration.contentType
				: [declaration.contentType];
	const contentType =
		body !== undefined ? getHeaderValue(headers, "content-type") : undefined;
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

	const normalized = declaredContentType
		? normalizeContentType(declaredContentType)
		: undefined;
	let parsedBody = body;
	if (normalized === "application/x-www-form-urlencoded") {
		if (!(body instanceof URLSearchParams)) {
			return {
				data: {},
				errors: [{ message: "Expected URLSearchParams form body." }],
			};
		}
		parsedBody = parseQueryOrFormData(body);
	} else if (normalized === "multipart/form-data") {
		if (!(body instanceof FormData)) {
			return {
				data: {},
				errors: [{ message: "Expected FormData multipart body." }],
			};
		}
		parsedBody = parseQueryOrFormData(body);
	}

	const result = await validateStandardSchema(declaration.body, parsedBody);
	if (result.issues) {
		return { data: {}, errors: result.issues };
	}

	return {
		data: {
			body: result.value,
			...(declaredContentType
				? { contentType: declaredContentType }
				: typeof contentType === "string"
					? { contentType }
					: {}),
		},
		errors: [],
	};
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
		...(request?.body
			? {
					body:
						request.contentType !== undefined
							? (body.data as Record<string, unknown>).body
							: body.data,
				}
			: {}),
		...(request?.contentType !== undefined &&
		request.contentType !== "application/json" &&
		(body.data as Record<string, unknown>).contentType !== undefined
			? {
					contentType: (body.data as Record<string, unknown>).contentType,
				}
			: {}),
		...(request?.query ? { query: query.data } : {}),
		...(request?.params ? { params: params.data } : {}),
		...(request?.headers ? { headers: headers.data } : {}),
	};
};

export async function validateRequest(
	route: RouteDeclaration,
	segments: RequestSegments,
): Promise<RequestValidationResponse> {
	const request = route.request;
	const body =
		request?.contentType !== undefined
			? await validateCustomBody(route, segments.body, segments.headers)
			: await validateRequestObject(request?.body, segments.body);
	const query = await validateRequestObject(
		request?.query,
		segments.query ? parseQueryOrFormData(segments.query) : undefined,
	);
	const params = await validateRequestObject(request?.params, segments.params);
	const headers = await validateHeaders(request?.headers, segments.headers);
	const issues = {
		body: body.errors,
		query: query.errors,
		params: params.errors,
		headers: headers.errors,
	};
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
		issues,
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

export const resolveCustomResponseBody = (
	declaredContentType: BodyContentType,
	body: unknown,
	selectedContentType: unknown,
	errorMessage: string,
): { contentType: string; body: unknown } => {
	const declaredContentTypes = Array.isArray(declaredContentType)
		? declaredContentType
		: [declaredContentType as string];
	const contentType =
		typeof selectedContentType === "string"
			? getDeclaredContentType(declaredContentTypes, selectedContentType)
			: declaredContentTypes.length === 1
				? declaredContentTypes[0]
				: undefined;

	if (!contentType) throw new Error(errorMessage);

	return {
		contentType,
		body,
	};
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
