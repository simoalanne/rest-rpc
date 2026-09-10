import type { StandardSchemaV1 } from "../standard-schema/index.ts";

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
export type FormBody<TSchema extends FormBodySchema = FormBodySchema> = {
	kind: "formBody";
	schema: TSchema;
};

/**
 * Declares a `multipart/form-data` request body.
 */
export type MultipartBody<
	TSchema extends MultipartBodySchema = MultipartBodySchema,
> = {
	kind: "multipartBody";
	schema: TSchema;
};

/**
 * Declares one or more non-JSON media types for a custom body.
 */
export type CustomBodyContentType = string | readonly string[];

/** A value that can be written as a custom HTTP response body. */
export type CustomResponseValue = string | Uint8Array;

type CustomResponseSchema = StandardSchemaV1<unknown, CustomResponseValue>;

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
	TSchema extends CustomResponseSchema = CustomResponseSchema,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = {
	kind: "customBody";
	schema: TSchema;
	contentType: TContentType;
};

/** Input accepted when declaring a response with a custom content type. */
export type CustomResponseInput<
	TSchema extends CustomResponseSchema = CustomResponseSchema,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> = {
	schema: TSchema;
	contentType: TContentType;
};

export type CustomBodyInput<
	TSchema extends StandardSchemaV1 = StandardSchemaV1,
	TContentType extends CustomBodyContentType = CustomBodyContentType,
> =
	| TSchema
	| {
			schema: TSchema;
			contentType: TContentType;
	  };

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
