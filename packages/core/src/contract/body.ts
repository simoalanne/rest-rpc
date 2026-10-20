import type { StandardSchemaV1 } from "../standard-schema/index.ts";

/** A commonly supported request or response body media type. */
export type KnownBodyContentType =
	| "application/json"
	| "application/octet-stream"
	| "application/x-www-form-urlencoded"
	| "multipart/form-data"
	| "text/plain";

/**
 * A base media type, lowercase and without parameters, such as
 * `application/json`.
 */
export type MediaType =
	| KnownBodyContentType
	| (`${string}/${string}` & Record<never, never>);

/**
 * Body schemas keyed by media type. Keys are base media types, lowercase and
 * without parameters.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/serialization}
 */
export type BodyContent = {
	readonly [TMediaType in KnownBodyContentType]?: StandardSchemaV1;
} & {
	readonly [mediaType: `${string}/${string}`]: StandardSchemaV1;
};

/** The media type of a body declared with only a schema. */
export type DefaultBodyContentType = "application/json";
