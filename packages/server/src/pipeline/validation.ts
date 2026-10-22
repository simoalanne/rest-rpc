import type {
	ResponseHeadersSchema,
	RouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	type StandardSchemaV1,
	validateStandardSchema,
} from "@rest-rpc/core/standard-schema";
import type { MaybePromise } from "@rest-rpc/core/utils";
import { allMaybePromise, mapMaybePromise } from "./maybePromise.ts";
import { isSseServerEvent, sse } from "./sse.ts";
import {
	requestValidationFailed,
	responseValidationFailed,
	type ResponseValidationLocation,
} from "./errors.ts";

/**
 * Decoded request segments passed into server request validation.
 */
export type RequestSegments = {
	body?: unknown;
	query?: Record<string, unknown>;
	params?: unknown;
	headers?: Record<string, string | undefined>;
};

type SegmentValidationResult = {
	data: unknown;
	errors: readonly StandardSchemaV1.Issue[];
};

const noIssues: readonly StandardSchemaV1.Issue[] = [];

const undeclaredSegment: SegmentValidationResult = {
	data: undefined,
	errors: noIssues,
};

const setQueryValue = (
	data: Record<string, unknown>,
	wireKey: string,
	value: string,
) => {
	if (!wireKey.endsWith("[]")) {
		data[wireKey] = value;
		return;
	}
	const key = wireKey.slice(0, -2);
	const current = data[key];
	if (Array.isArray(current)) current.push(value);
	else data[key] = [value];
};

/**
 * Parses a raw query string without the leading `?`. Keys ending in `[]`
 * collect arrays; other repeated keys keep the last value.
 */
export function parseQuery(search: string): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	// Only encoded queries need `URLSearchParams` to decode them.
	if (search.includes("%") || search.includes("+")) {
		new URLSearchParams(search).forEach((value, wireKey) =>
			setQueryValue(data, wireKey, value),
		);
		return data;
	}

	for (const pair of search.split("&")) {
		if (!pair) continue;
		const separator = pair.indexOf("=");
		if (separator === -1) setQueryValue(data, pair, "");
		else
			setQueryValue(data, pair.slice(0, separator), pair.slice(separator + 1));
	}
	return data;
}

const isDeclared = (
	schemas: readonly StandardSchemaV1[] | undefined,
): schemas is readonly StandardSchemaV1[] =>
	schemas !== undefined && schemas.length > 0;

const toSegmentValidationResult = (
	result: StandardSchemaV1.Result<unknown>,
): SegmentValidationResult =>
	result.issues
		? { data: undefined, errors: result.issues }
		: { data: result.value, errors: noIssues };

// Schemas run in order and stay synchronous until one returns a promise.
const validateStackedRequestSegment = (
	schemas: readonly StandardSchemaV1[],
	input: unknown,
	index = 0,
	merged: Record<string, unknown> = {},
): MaybePromise<SegmentValidationResult> => {
	if (index === schemas.length) return { data: merged, errors: noIssues };

	return mapMaybePromise(
		validateStandardSchema(schemas[index]!, input),
		(result) => {
			if (result.issues) return { data: undefined, errors: result.issues };
			if (typeof result.value !== "object" || result.value === null) {
				throw new Error("Stacked request schema outputs must be objects.");
			}
			return validateStackedRequestSegment(schemas, input, index + 1, {
				...merged,
				...result.value,
			});
		},
	);
};

const validateRequestSegment = (
	schemas: readonly StandardSchemaV1[] | undefined,
	input: unknown,
): MaybePromise<SegmentValidationResult> => {
	if (!isDeclared(schemas)) return undeclaredSegment;
	if (schemas.length > 1) return validateStackedRequestSegment(schemas, input);

	return mapMaybePromise(
		validateStandardSchema(schemas[0], input),
		toSegmentValidationResult,
	);
};

type RequestSegmentValues = Record<
	"body" | "query" | "params" | "headers",
	unknown
>;

const toValidatedRequest = ([
	body,
	query,
	params,
	headers,
]: readonly SegmentValidationResult[]): RequestSegmentValues => {
	if (
		body.errors.length > 0 ||
		query.errors.length > 0 ||
		params.errors.length > 0 ||
		headers.errors.length > 0
	) {
		throw requestValidationFailed({
			body: body.errors,
			query: query.errors,
			params: params.errors,
			headers: headers.errors,
		});
	}
	return {
		body: body.data,
		query: query.data,
		params: params.data,
		headers: headers.data,
	};
};

const noRequestSegments: RequestSegmentValues = {
	body: undefined,
	query: undefined,
	params: undefined,
	headers: undefined,
};

/**
 * Validates decoded request segments, ignoring segments the route does not
 * declare, except params, which are passed through without a schema. The body
 * is validated with the schemas of `mediaType`.
 */
export function validateRequestSegments(
	route: RouteDeclaration,
	segments: RequestSegments,
	mediaType?: string,
): MaybePromise<RequestSegmentValues> {
	const requestSchemas = route.request;
	if (!requestSchemas) {
		return segments.params === undefined
			? noRequestSegments
			: { ...noRequestSegments, params: segments.params };
	}
	return mapMaybePromise(
		allMaybePromise([
			validateRequestSegment(
				mediaType === undefined ? undefined : requestSchemas.body?.[mediaType],
				segments.body,
			),
			validateRequestSegment(requestSchemas.query, segments.query),
			// Params of dynamic path segments without a schema are passed as strings.
			isDeclared(requestSchemas.params)
				? validateRequestSegment(requestSchemas.params, segments.params)
				: { data: segments.params, errors: noIssues },
			validateRequestSegment(requestSchemas.headers, segments.headers),
		]),
		toValidatedRequest,
	);
}

export const validateResponseValue = (
	schema: StandardSchemaV1 | undefined,
	value: unknown,
	location: Exclude<ResponseValidationLocation, "headers">,
): MaybePromise<unknown> => {
	if (!schema) return value;

	return mapMaybePromise(validateStandardSchema(schema, value), (result) => {
		if (result.issues) {
			throw responseValidationFailed(location, result.issues);
		}
		return result.value;
	});
};

export const validateResponseHeaders = (
	schema: { headers?: ResponseHeadersSchema } | undefined,
	headers: Record<string, unknown> | undefined,
): MaybePromise<Record<string, unknown> | undefined> => {
	if (!schema) return undefined;

	const declaredHeaders = schema.headers;
	if (!declaredHeaders) return undefined;

	return mapMaybePromise(
		validateStandardSchema(declaredHeaders, headers ?? {}),
		(result) => {
			if (result.issues) {
				throw responseValidationFailed("headers", result.issues);
			}
			return result.value;
		},
	);
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
