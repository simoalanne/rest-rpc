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
 * @remarks Servers pass the Fetch `Request` and clients pass the Fetch
 * `Response`, so one codec works on both sides.
 */
export type BodyDeserializer = (
	source: Request | Response,
) => unknown | Promise<unknown>;

/** Supplies optional operations selected by a normalized base media type. */
export type BodyCodec = {
	match: (mediaType: string) => boolean;
	serialize?: BodySerializer;
	deserialize?: BodyDeserializer;
};
