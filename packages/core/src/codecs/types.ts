/** Body prepared by a codec for delivery through its destination transport. */
export type SerializedBody = {
	body: unknown;
	headers?: Record<string, string | number | undefined>;
	contentType?: string | null;
};

/** Encodes an outgoing value using the complete selected content-type declaration. */
export type BodySerializer = (
	value: unknown,
	declaredContentType: string,
) => SerializedBody | Promise<SerializedBody>;

/**
 * Reads an incoming body and returns a value for schema validation.
 *
 * @remarks The client and the Fetch server pass the Fetch `Response` or
 * `Request`, so one codec works on both sides. The Node server passes its own
 * source.
 */
export type BodyDeserializer<Source = Request | Response> = (
	source: Source,
) => unknown | Promise<unknown>;

/** Supplies optional operations selected by a normalized base media type. */
export type BodyCodec<Source = Request | Response> = {
	match: (mediaType: string) => boolean;
	serialize?: BodySerializer;
	deserialize?: BodyDeserializer<Source>;
};
