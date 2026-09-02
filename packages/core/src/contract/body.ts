import {
	isStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";
import { resolveBuiltInRequestKeys } from "./requestKeys.ts";

type BodyScalar = string | number | boolean;

/** A form body schema whose input can be serialized as URL-encoded fields. */
export type FormBodySchema = StandardSchemaV1<
	Record<string, BodyScalar | readonly BodyScalar[] | undefined>,
	unknown
>;

type MultipartBodyValue = BodyScalar | Blob;

/** A multipart body schema whose input can be serialized as form-data fields. */
export type MultipartBodySchema = StandardSchemaV1<
	Record<
		string,
		MultipartBodyValue | readonly MultipartBodyValue[] | undefined
	>,
	unknown
>;

type BodyWithArrayKeysSchema = FormBodySchema | MultipartBodySchema;

/**
 * Marks a request or response body as intentionally empty.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-without-body}
 */
export type NoBody = {
	kind: "noBody";
};

/**
 * Declares an `application/x-www-form-urlencoded` request body.
 */
export type FormBody<
	TSchema extends FormBodySchema = FormBodySchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = {
	kind: "formBody";
	schema: TSchema;
	arrayKeys: TArrayKeys;
};

/**
 * Declares a `multipart/form-data` request body.
 */
export type MultipartBody<
	TSchema extends MultipartBodySchema = MultipartBodySchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = {
	kind: "multipartBody";
	schema: TSchema;
	arrayKeys: TArrayKeys;
};

/**
 * Declares one or more non-JSON media types for a custom body.
 */
export type CustomBodyContentType = string | readonly string[];

/** Options for a structured body whose selected fields are encoded as arrays. */
export type BodyWithArrayKeysOptions<
	TSchema extends BodyWithArrayKeysSchema = BodyWithArrayKeysSchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = {
	schema: TSchema;
	arrayKeys: TArrayKeys;
};

export type BodyWithArrayKeysInput<
	TSchema extends BodyWithArrayKeysSchema = BodyWithArrayKeysSchema,
	TArrayKeys extends readonly string[] = readonly string[],
> = TSchema | BodyWithArrayKeysOptions<TSchema, TArrayKeys>;

export function resolveBodyWithArrayKeys<
	const TSchema extends BodyWithArrayKeysSchema,
	const TArrayKeys extends readonly string[] = readonly string[],
>(
	input: BodyWithArrayKeysInput<TSchema, TArrayKeys>,
): {
	schema: TSchema;
	arrayKeys: readonly string[];
} {
	if (!isStandardSchema(input)) {
		return input;
	}

	return {
		schema: input,
		arrayKeys: Object.entries(resolveBuiltInRequestKeys(input) ?? {})
			.filter(([, isArray]) => isArray)
			.map(([key]) => key),
	};
}

/**
 * Declares a body schema with one or more non-JSON content types.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type}
 */
export type CustomBody<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType | undefined =
		| CustomBodyContentType
		| undefined,
> = {
	kind: "customBody";
	schema: TSchema;
} & ([TContentType] extends [CustomBodyContentType]
	? { contentType: TContentType }
	: { contentType?: Exclude<TContentType, undefined> });

/**
 * A response body declaration with an explicit content type.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type}
 */
export type CustomResponseBody<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = {
	kind: "customBody";
	schema: TSchema;
	contentType: TContentType;
};

/** Input accepted when declaring a response with a custom content type. */
export type CustomResponseInput<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = {
	schema: TSchema;
	contentType: TContentType;
};

export type CustomBodyInput<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = TSchema | CustomResponseInput<TSchema, TContentType>;

/**
 * Declares a streaming response body.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses}
 */
export type Stream<
	TBody extends StandardSchemaV1 | CustomResponseBody =
		| StandardSchemaV1
		| CustomResponseBody,
> = {
	kind: "stream";
	schema: TBody;
};

export function isNoBody(body: unknown): body is NoBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"kind" in body &&
		body.kind === "noBody"
	);
}

export function isFormBody(body: unknown): body is FormBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"kind" in body &&
		body.kind === "formBody"
	);
}

export function isMultipartBody(body: unknown): body is MultipartBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"kind" in body &&
		body.kind === "multipartBody"
	);
}

export function isStream(response: unknown): response is Stream {
	return (
		typeof response === "object" &&
		response !== null &&
		"kind" in response &&
		response.kind === "stream"
	);
}

export function isCustomBody(schema: unknown): schema is CustomBody {
	return (
		typeof schema === "object" &&
		schema !== null &&
		"kind" in schema &&
		schema.kind === "customBody"
	);
}
