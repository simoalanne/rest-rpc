import type {
	ResponseDeclaration,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	type StandardSchemaV1,
	validateStandardSchema,
} from "@rest-rpc/core/standard-schema";
import { isSseServerEvent, sse } from "./sse.ts";
import { ResponseValidationError, RequestValidationError } from "./errors.ts";

/**
 * Parsed request pieces passed into server request validation.
 */
export type RequestSegments = {
	body?: unknown;
	/** Raw query string without the leading `?`. */
	query?: string;
	params?: unknown;
	headers?: Record<string, string | readonly string[] | undefined>;
};

type SegmentValidationResult = {
	data: unknown;
	errors: readonly StandardSchemaV1.Issue[];
};

const parseQuery = (search: string) => {
	const data: Record<string, unknown> = {};

	for (const [wireKey, value] of new URLSearchParams(search)) {
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

const isDeclared = (
	schemas: readonly StandardSchemaV1[] | undefined,
): schemas is readonly StandardSchemaV1[] =>
	schemas !== undefined && schemas.length > 0;

/**
 * Keeps only the request segments the route declares schemas for, parsing the
 * query string when it is declared.
 */
export function readDeclaredRequestSegments(
	route: RouteDeclaration,
	segments: RequestSegments,
) {
	const schemas = route.request;
	return {
		body: isDeclared(schemas?.body) ? segments.body : undefined,
		query: isDeclared(schemas?.query)
			? parseQuery(segments.query ?? "")
			: undefined,
		params: isDeclared(schemas?.params) ? segments.params : undefined,
		headers: isDeclared(schemas?.headers) ? segments.headers : undefined,
	};
}

const validateRequestSegment = async (
	schemas: readonly StandardSchemaV1[] | undefined,
	input: unknown,
): Promise<SegmentValidationResult> => {
	if (!isDeclared(schemas)) return { data: undefined, errors: [] };

	let merged: Record<string, unknown> = {};

	for (const schema of schemas) {
		const result = await validateStandardSchema(schema, input);

		if (result.issues) {
			return { data: undefined, errors: result.issues };
		}

		if (schemas.length === 1) {
			return { data: result.value, errors: [] };
		}

		if (typeof result.value !== "object" || result.value === null) {
			throw new Error("Stacked request schema outputs must be objects.");
		}

		merged = { ...merged, ...result.value };
	}
	return { data: merged, errors: [] };
};

export async function validateRequestSegments(
	route: RouteDeclaration,
	segments: RequestSegments,
) {
	const requestSchemas = route.request;
	const declared = readDeclaredRequestSegments(route, segments);
	const body = await validateRequestSegment(
		requestSchemas?.body,
		declared.body,
	);
	const query = await validateRequestSegment(
		requestSchemas?.query,
		declared.query,
	);
	const params = await validateRequestSegment(
		requestSchemas?.params,
		declared.params,
	);
	const headers = await validateRequestSegment(
		requestSchemas?.headers,
		declared.headers,
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

export const validateResponseValue = async (
	schema: StandardSchemaV1 | undefined,
	value: unknown,
	location: "body" | "stream",
): Promise<unknown> => {
	if (!schema) return value;

	const validation = await validateStandardSchema(schema, value);
	if (validation.issues) {
		throw new ResponseValidationError(location, validation.issues);
	}
	return validation.value;
};

export const stringifyHeaders = (
	headers: Record<string, unknown> | undefined,
): Record<string, string> =>
	Object.fromEntries(
		Object.entries(headers ?? {}).flatMap(([name, value]) =>
			value === undefined ? [] : [[name, String(value)]],
		),
	);

export const validateResponseHeaders = async (
	schema: ResponseDeclaration | undefined,
	headers: Record<string, unknown> | undefined,
): Promise<Record<string, string> | undefined> => {
	if (!schema) return undefined;

	const declaredHeaders = schema.headers;
	if (!declaredHeaders) return undefined;

	const result = await validateStandardSchema(declaredHeaders, headers ?? {});
	if (result.issues) {
		throw new ResponseValidationError("headers", result.issues);
	}

	return stringifyHeaders(result.value);
};

export async function* validateResponseStreamChunks(
	body: AsyncIterable<unknown>,
	schema: StandardSchemaV1,
) {
	for await (const chunk of body) {
		if (isSseServerEvent(chunk)) {
			yield sse({
				...chunk,
				data: await validateResponseValue(schema, chunk.data, "stream"),
			});
		} else {
			yield await validateResponseValue(schema, chunk, "stream");
		}
	}
}
