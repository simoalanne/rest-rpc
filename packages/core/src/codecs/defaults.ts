import { isAsyncIterable } from "./operations.ts";
import type { BodyCodec } from "./types.ts";

/** Fetch-compatible built-in codecs, ordered from specific formats to binary fallback. */
export const defaultBodyCodecs: readonly BodyCodec[] = [
	{
		match: (mediaType) =>
			mediaType === "application/json" || mediaType.endsWith("+json"),
		serialize: (value) => {
			const body = JSON.stringify(value);
			if (body === undefined) throw new TypeError("Expected a JSON body");
			return { body };
		},
		deserialize: (source) => source.json(),
	},
	{
		match: (mediaType) => mediaType === "application/x-www-form-urlencoded",
		serialize: (value) => {
			if (!(value instanceof URLSearchParams))
				throw new TypeError("Expected URLSearchParams body");
			return { body: value };
		},
		deserialize: async (source) => new URLSearchParams(await source.text()),
	},
	{
		match: (mediaType) => mediaType === "multipart/form-data",
		serialize: (value) => {
			if (!(value instanceof FormData))
				throw new TypeError("Expected FormData body");
			return { body: value, contentType: null };
		},
		deserialize: (source) => source.formData(),
	},
	{
		match: (mediaType) => mediaType.startsWith("text/"),
		serialize: (value) => {
			if (typeof value !== "string")
				throw new TypeError("Expected string body");
			return { body: value };
		},
		deserialize: (source) => source.text(),
	},
	{
		match: () => true,
		serialize: (value) => {
			if (
				value instanceof Blob ||
				value instanceof Uint8Array ||
				value instanceof ReadableStream ||
				isAsyncIterable(value)
			)
				return { body: value };
			throw new TypeError(
				"Expected Blob, Uint8Array, ReadableStream or AsyncIterable body",
			);
		},
		deserialize: (source) => source.blob(),
	},
];
