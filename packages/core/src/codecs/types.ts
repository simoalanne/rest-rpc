/**
 * A body a serializer can return. On the client it must be a Fetch request
 * body. On the server it must be a value the runtime can send; async iterables
 * are sent as streams, with strings encoded as UTF-8.
 */
export type BodyValue =
	| string
	| ArrayBuffer
	| ArrayBufferView
	| Blob
	| FormData
	| URLSearchParams
	| ReadableStream<Uint8Array>
	| AsyncIterable<string | Uint8Array>;

/**
 * A body sent with its own headers, created with `serializedBody()`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#custom-codecs}
 */
export type SerializedBody = {
	readonly body: BodyValue;
	/** Headers with lowercase names. */
	readonly headers: Readonly<Record<string, string>>;
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
 * The body of an incoming request or response, read once with one of its
 * methods.
 *
 * @remarks Fetch `Request` and `Response` objects are incoming bodies, so the
 * client and Fetch servers pass them as is. The Node server passes an object
 * that reads the request stream, so a codec should not rely on other
 * properties of `Request`.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#custom-codecs}
 */
export type IncomingBody = {
	/** Reads the body as UTF-8 text. */
	text(): Promise<string>;
	/** Reads the body as UTF-8 text and parses it as JSON. */
	json(): Promise<unknown>;
	/** Reads the body as bytes. */
	arrayBuffer(): Promise<ArrayBuffer>;
	/** Reads the body as a `Blob` typed with the content type. */
	blob(): Promise<Blob>;
	/** The body as a stream, or `null` when the request has no body. */
	readonly body: ReadableStream<Uint8Array> | null;
};

/**
 * Reads an incoming body and returns a value for schema validation.
 *
 * @remarks It receives the complete content type of the body, with parameters
 * such as `charset`, as the serializer does.
 */
export type BodyDeserializer = (
	body: IncomingBody,
	contentType: string,
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
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#custom-codecs}
 */
export type BodyCodec = {
	mediaTypes: readonly (string | RegExp)[];
} & BodyCodecOperations;
