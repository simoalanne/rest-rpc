import type { StandardSchemaV1 } from "../standard-schema/index.ts";

/**
 * Marks a request or response body as intentionally empty.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-without-body}
 */
export type NoBody = {
	kind: "noBody";
};

/**
 * Declares one or more non-JSON media types for a custom body.
 */
export type CustomBodyContentType = string | readonly string[];

/**
 * Declares that a request or response has no body.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-without-body}
 */
export function noBody(): NoBody {
	return {
		kind: "noBody",
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
} & (TContentType extends undefined
	? { contentType?: undefined }
	: { contentType: TContentType });

/**
 * A custom body declaration that is valid for responses.
 */
export type CustomResponseBody = CustomBody<
	StandardSchemaV1,
	CustomBodyContentType
>;

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

/**
 * Declares a streaming response body.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#streaming-ndjson-responses}
 */
export function stream<
	const TBody extends StandardSchemaV1 | CustomResponseBody,
>(schema: TBody): Stream<TBody> {
	return {
		kind: "stream",
		schema,
	};
}

/**
 * Declares a body schema with one or more non-JSON content types.
 *
 * @remarks Pass a schema directly when the generated client should pass the
 * request body to `fetch()` and let the runtime set the content-type header.
 * Response bodies must use the object form and declare `contentType` because
 * the server adapter needs a concrete media type to send.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#response-with-custom-content-type}
 */
export function customBody<const TSchema extends StandardSchemaV1>(
	schema: TSchema,
): CustomBody<TSchema, undefined>;
export function customBody<
	const TSchema extends StandardSchemaV1,
	const TContentType extends CustomBodyContentType,
>(input: {
	schema: TSchema;
	contentType: TContentType;
}): CustomBody<TSchema, TContentType>;
export function customBody<const TSchema extends StandardSchemaV1>(
	input:
		| TSchema
		| {
				schema: TSchema;
				contentType: CustomBodyContentType;
		  },
): CustomBody<TSchema, CustomBodyContentType | undefined> {
	const schema = "~standard" in input ? input : input.schema;
	const contentType = "~standard" in input ? undefined : input.contentType;

	return {
		kind: "customBody",
		schema,
		contentType,
	} as CustomBody<TSchema, CustomBodyContentType | undefined>;
}

/**
 * Checks whether a value is a no-body declaration.
 */
export function isNoBody(body: unknown): body is NoBody {
	return (
		typeof body === "object" &&
		body !== null &&
		"kind" in body &&
		body.kind === "noBody"
	);
}

/**
 * Checks whether a value is a stream body declaration.
 */
export function isStream(response: unknown): response is Stream {
	return (
		typeof response === "object" &&
		response !== null &&
		"kind" in response &&
		response.kind === "stream"
	);
}

/**
 * Checks whether a value is a custom body declaration.
 */
export function isCustomBody(schema: unknown): schema is CustomBody {
	return (
		typeof schema === "object" &&
		schema !== null &&
		"kind" in schema &&
		schema.kind === "customBody"
	);
}
