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

/** Reads an entry point's native source and returns a value for schema validation. */
export type BodyDeserializer<TSource> = (
	source: TSource,
) => unknown | Promise<unknown>;

/** Supplies optional operations selected by a normalized base media type. */
export type BodyCodec<TSource> = {
	match: (mediaType: string) => boolean;
	serialize?: BodySerializer;
	deserialize?: BodyDeserializer<TSource>;
};
