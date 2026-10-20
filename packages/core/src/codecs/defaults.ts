import { bodyCodec } from "./bodyCodec.ts";
import { isAsyncIterable } from "./operations.ts";
import { serializedBody } from "./serializedBody.ts";
import type { BodyCodec } from "./types.ts";

/** Fetch-compatible built-in codecs, ordered from specific formats to binary fallback. */
export const defaultBodyCodecs: readonly BodyCodec[] = [
	bodyCodec(["application/json", /\+json$/], {
		serialize: (value) => {
			const body = JSON.stringify(value);
			if (body === undefined) throw new TypeError("Expected a JSON body");
			return body;
		},
		deserialize: (source) => source.json(),
	}),
	bodyCodec("application/x-www-form-urlencoded", {
		serialize: (value) => {
			if (!(value instanceof URLSearchParams))
				throw new TypeError("Expected URLSearchParams body");
			return value;
		},
		deserialize: async (source) => new URLSearchParams(await source.text()),
	}),
	bodyCodec("multipart/form-data", {
		serialize: (value) => {
			if (!(value instanceof FormData))
				throw new TypeError("Expected FormData body");
			// Fetch sets the content type with the generated boundary.
			return serializedBody(value);
		},
		deserialize: (source) => source.formData(),
	}),
	bodyCodec(/^text\//, {
		serialize: (value) => {
			if (typeof value !== "string")
				throw new TypeError("Expected string body");
			return value;
		},
		deserialize: (source) => source.text(),
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
		deserialize: (source) => source.blob(),
	}),
];
