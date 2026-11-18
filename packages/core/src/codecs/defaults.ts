import { bodyCodec } from "./bodyCodec.ts";
import { isAsyncIterable } from "./operations.ts";
import type {
	BodyCodec,
	BodyValue,
	BuiltInBodyCodec,
	IncomingBody,
} from "./types.ts";

/** The built-in JSON serializer. Fetch handlers detect it to send `Response.json` instead. */
export const serializeJson = (value: unknown): string => {
	const body = JSON.stringify(value);
	if (body === undefined) throw new TypeError("Expected a JSON body");
	return body;
};

// Narrows `bodyCodec()`, which types its operations as any codec's, to the
// operations a built-in codec defines.
const builtIn = <TSerialized extends BodyValue, TDecoded>(
	mediaTypes: string | RegExp | readonly (string | RegExp)[],
	operations: {
		serialize: (value: unknown) => TSerialized;
		deserialize: (body: IncomingBody) => Promise<TDecoded>;
	},
) =>
	bodyCodec(mediaTypes, operations) as BuiltInBodyCodec<TSerialized, TDecoded>;

/**
 * The built-in codec of `application/json` and `+json` media types. It
 * serializes any value `JSON.stringify` encodes, and throws for others, such
 * as `undefined`.
 *
 * @remarks Types don't change with what JSON can represent. The receiving
 * side's type is the schema's output, or the handler's return type without a
 * schema, but it receives what `JSON.stringify` made of the value: a `Date` is
 * typed as a `Date` and arrives as a string, a `Map` or `Set` as `{}`, and an
 * `undefined` property is left out. A `bigint` throws, which fails the
 * request. Use schemas whose output JSON can represent, or a codec for a
 * format that can.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#bodies}
 */
export const jsonCodec: BuiltInBodyCodec<string, unknown> = builtIn(
	["application/json", /\+json$/],
	{
		serialize: serializeJson,
		// Returned without an async wrapper, so Fetch's native parser adds no
		// promise per request.
		deserialize: (body) => body.json(),
	},
);

/**
 * The built-in codec of `application/x-www-form-urlencoded`. It serializes
 * `URLSearchParams` and throws for other values.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#bodies}
 */
export const urlEncodedCodec: BuiltInBodyCodec<
	URLSearchParams,
	URLSearchParams
> = builtIn("application/x-www-form-urlencoded", {
	serialize: (value) => {
		if (!(value instanceof URLSearchParams))
			throw new TypeError("Expected URLSearchParams body");
		return value;
	},
	deserialize: async (body) => new URLSearchParams(await body.text()),
});

/**
 * The built-in codec of `multipart/form-data`. It serializes `FormData` and
 * throws for other values.
 *
 * @remarks Wrap it in a custom codec to send other values as multipart, such
 * as objects with `File` fields.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#custom-codecs}
 */
export const formDataCodec: BuiltInBodyCodec<FormData, FormData> = builtIn(
	"multipart/form-data",
	{
		serialize: (value) => {
			if (!(value instanceof FormData))
				throw new TypeError("Expected FormData body");
			return value;
		},
		deserialize: (body) => body.formData(),
	},
);

/**
 * The built-in codec of `text/*` media types. It serializes strings and throws
 * for other values, and decodes bodies as UTF-8.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#bodies}
 */
export const textCodec: BuiltInBodyCodec<string, string> = builtIn(/^text\//, {
	serialize: (value) => {
		if (typeof value !== "string") throw new TypeError("Expected string body");
		return value;
	},
	deserialize: (body) => body.text(),
});

/**
 * The built-in codec of every media type no other codec lists. It serializes
 * a `Blob`, `Uint8Array`, `ReadableStream` or async iterable, streams as their
 * chunks arrive, and decodes a body whole into a `Blob`.
 *
 * @remarks The receiving side always gets a `Blob`, whatever was sent, but its
 * type is the schema's output, or the handler's return type without a schema.
 * A `Uint8Array` a handler returns is typed as a `Uint8Array` on the client
 * and arrives as a `Blob`, and a request body schema that expects a
 * `Uint8Array` rejects every request. Type received binary
 * bodies as `Blob`, or decode them with a custom codec.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#bodies}
 */
export const binaryCodec: BuiltInBodyCodec<BodyValue, Blob> = builtIn(/.*/, {
	serialize: (value) => {
		if (
			value instanceof Blob ||
			value instanceof Uint8Array ||
			value instanceof ReadableStream ||
			isAsyncIterable(value)
		)
			return value as BodyValue;
		throw new TypeError(
			"Expected Blob, Uint8Array, ReadableStream or AsyncIterable body",
		);
	},
	deserialize: (body) => body.blob(),
});

// The codecs every client and server uses after those in `bodyCodecs`,
// ordered from specific media types to the binary fallback.
export const defaultBodyCodecs: readonly BodyCodec[] = [
	jsonCodec,
	urlEncodedCodec,
	formDataCodec,
	textCodec,
	binaryCodec,
];
