import { bodyCodec } from "./bodyCodec.ts";
import { isAsyncIterable } from "./operations.ts";
import { serializedBody } from "./serializedBody.ts";
import type { BodyCodec, IncomingBody } from "./types.ts";

/** The built-in JSON serializer. Fetch handlers detect it to send `Response.json` instead. */
export const serializeJson = (value: unknown) => {
	const body = JSON.stringify(value);
	if (body === undefined) throw new TypeError("Expected a JSON body");
	return body;
};

/** The built-in JSON deserializer. Sources with a `json` method, such as Fetch requests and responses, are read with it instead. */
export const deserializeJson = async (body: IncomingBody): Promise<unknown> =>
	JSON.parse(await body.text());

/** The built-in multipart deserializer. Sources with a `formData` method, such as Fetch requests and responses, are read with it instead. */
export const deserializeFormData = async (
	body: IncomingBody,
	contentType: string,
): Promise<FormData> =>
	new Response(await body.arrayBuffer(), {
		headers: { "content-type": contentType },
	}).formData();

/** Fetch-compatible built-in codecs, ordered from specific formats to binary fallback. */
export const defaultBodyCodecs: readonly BodyCodec[] = [
	bodyCodec(["application/json", /\+json$/], {
		serialize: serializeJson,
		deserialize: deserializeJson,
	}),
	bodyCodec("application/x-www-form-urlencoded", {
		serialize: (value) => {
			if (!(value instanceof URLSearchParams))
				throw new TypeError("Expected URLSearchParams body");
			return value;
		},
		deserialize: async (body) => new URLSearchParams(await body.text()),
	}),
	bodyCodec("multipart/form-data", {
		serialize: (value) => {
			if (!(value instanceof FormData))
				throw new TypeError("Expected FormData body");
			// Fetch sets the content type with the generated boundary.
			return serializedBody(value);
		},
		deserialize: deserializeFormData,
	}),
	bodyCodec(/^text\//, {
		serialize: (value) => {
			if (typeof value !== "string")
				throw new TypeError("Expected string body");
			return value;
		},
		deserialize: (body) => body.text(),
	}),
	bodyCodec(/.*/, {
		serialize: (value) => {
			if (
				value instanceof Blob ||
				value instanceof Uint8Array ||
				value instanceof ReadableStream ||
				isAsyncIterable(value)
			)
				return value;
			throw new TypeError(
				"Expected Blob, Uint8Array, ReadableStream or AsyncIterable body",
			);
		},
		deserialize: (body) => body.blob(),
	}),
];
