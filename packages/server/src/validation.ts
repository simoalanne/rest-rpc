import {
	type CustomBody,
	getResponseHeaders,
	isCustomBody,
	isJsonQuery,
	isNoBody,
	isRequestSchemaRecord,
	isStandardSchema,
	isStream,
	type JsonQuery,
	type ResponseBodySchema,
	type ResponseDeclaration,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import { validateStandardSchema } from "@rest-rpc/core/standard-schema";
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
	pathParams?: unknown;
	headers?: unknown;
};

type SegmentValidationResult = {
	data: Record<string, unknown>;
	errors: readonly StandardSchemaV1.Issue[];
};

type RequestObjectSchema = StandardSchemaV1<unknown, Record<string, unknown>>;

const parseJsonQuery = (value: unknown) => {
	if (Array.isArray(value)) value = value[0];
	if (value === undefined) return undefined;
	if (typeof value !== "string") return value;
	return JSON.parse(value);
};

const getHeaderValue = (headers: unknown, name: string): string | undefined => {
	if (typeof headers !== "object" || headers === null) return undefined;

	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== name) continue;
		if (Array.isArray(value)) return String(value[0]);
		if (value === undefined) return undefined;
		return String(value);
	}

	return undefined;
};

const validateSchemaRecord = async (
	schemas: Record<string, StandardSchemaV1>,
	input: unknown,
): Promise<SegmentValidationResult> => {
	const data: Record<string, unknown> = {};
	const errors: StandardSchemaV1.Issue[] = [];
	const objectInput =
		typeof input === "object" && input !== null
			? (input as Record<string, unknown>)
			: undefined;

	for (const [key, schema] of Object.entries(schemas)) {
		const result = await validateStandardSchema(schema, objectInput?.[key]);
		if (result.issues) {
			errors.push(...result.issues);
			continue;
		}
		data[key] = result.value;
	}

	return { data, errors };
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

	if (isRequestSchemaRecord(declaration)) {
		return validateSchemaRecord(declaration, input);
	}

	return { data: {}, errors: [] };
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
	if (!isCustomBody(route.body)) return { data: {}, errors: [] };
	const contentTypes = Array.isArray(route.body.contentType)
		? route.body.contentType
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

	const result = await validateStandardSchema(route.body.schema, body);
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
	pathParams: SegmentValidationResult,
	headers: SegmentValidationResult,
) => {
	return {
		...(route.body && !isNoBody(route.body)
			? { body: isCustomBody(route.body) ? body.data.body : body.data }
			: {}),
		...(route.query
			? { query: isJsonQuery(route.query) ? query.data.query : query.data }
			: {}),
		...(route.pathParams ? { pathParams: pathParams.data } : {}),
		...(route.headers ? { headers: headers.data } : {}),
	};
};

export async function validateRequest(
	route: RouteDeclaration,
	segments: RequestSegments,
): Promise<RequestValidationResponse> {
	const body = isCustomBody(route.body)
		? await validateCustomBody(route, segments.body, segments.headers)
		: await validateRequestObject(route.body, segments.body);
	const query = isJsonQuery(route.query)
		? await validateJsonQuery(route.query, segments.query)
		: await validateRequestObject(route.query, segments.query);
	const pathParams = await validateRequestObject(
		route.pathParams,
		segments.pathParams,
	);
	const headers = await validateRequestObject(route.headers, segments.headers);
	const errors = [
		...body.errors,
		...query.errors,
		...pathParams.errors,
		...headers.errors,
	];

	if (errors.length === 0) {
		return {
			success: true,
			data: getValidatedRequestData(route, body, query, pathParams, headers),
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

type DeclaredResponseHeaderValue = string | number;

const isDeclaredResponseHeaderValue = (
	value: unknown,
): value is DeclaredResponseHeaderValue =>
	typeof value === "string" || typeof value === "number";

export const validateResponseHeaders = async (
	schema: ResponseDeclaration | undefined,
	headers: Record<string, unknown> | undefined,
): Promise<HttpHeaders | undefined> => {
	if (!schema) return undefined;

	const declaredHeaders = getResponseHeaders(schema);
	if (!declaredHeaders) return undefined;

	const normalized: HttpHeaders = {};
	for (const [name, headerSchema] of Object.entries(declaredHeaders)) {
		const result = await validateStandardSchema(headerSchema, headers?.[name]);
		if (result.issues) throw result.issues;
		if (result.value === undefined) continue;

		if (!isDeclaredResponseHeaderValue(result.value)) {
			throw new Error(
				`Declared response header "${name}" must resolve to a string or number.`,
			);
		}

		normalized[name] = result.value;
	}

	return normalized;
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

export async function* validateResponseStreamChunks(
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
		const validation = await validateStandardSchema(chunkSchema, chunk);
		if (validation.issues) {
			throw new Error("Stream response validation failed.", {
				cause: validation.issues,
			});
		}
		yield validation.value;
	}
}
