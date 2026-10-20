/**
 * A body a serializer can return. On the client it must be a Fetch request
 * body. On the server it must be a value the runtime can send; async iterables
 * are sent as streams.
 */
export type BodyValue =
	| string
	| ArrayBuffer
	| ArrayBufferView
	| Blob
	| FormData
	| URLSearchParams
	| ReadableStream
	| AsyncIterable<unknown>;

/**
 * A body sent with its own headers, created with `serializedBody()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/serialization#serializer-result}
 */
export type SerializedBody = {
	readonly body: BodyValue;
	readonly headers: Headers;
};

/**
 * Serializes an outgoing value for the complete selected content type. A
 * `BodyValue` is sent with the selected content type, and a `SerializedBody`
 * with its own headers.
 */
export type BodySerializer = (
	value: unknown,
	contentType: string,
) => BodyValue | SerializedBody | Promise<BodyValue | SerializedBody>;

/**
 * Reads an incoming body and returns a value for schema validation.
 *
 * @remarks The client passes the Fetch `Response` and the server the Fetch
 * `Request`. Both share the Fetch body methods, so one codec works on both
 * sides. A codec used only on one side can treat `source` as that type.
 */
export type BodyDeserializer = (
	source: Request | Response,
) => unknown | Promise<unknown>;

/**
 * The operations of a body codec. At least one is required, and each is
 * selected independently of the other.
 */
export type BodyCodecOperations =
	| { serialize: BodySerializer; deserialize?: BodyDeserializer }
	| { serialize?: BodySerializer; deserialize: BodyDeserializer };

/**
 * Serializes and deserializes bodies of the base media types it lists.
 *
 * @remarks Strings match a lowercase base media type exactly and take
 * precedence over patterns. Patterns are tested in codec order when no string
 * matches.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/serialization#custom-codecs}
 */
export type BodyCodec = {
	mediaTypes: readonly (string | RegExp)[];
} & BodyCodecOperations;
