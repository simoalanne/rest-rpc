import type { BodyCodec } from "@rest-rpc/core";
import { StreamableFile } from "@nestjs/common";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

// Nest owns JSON serialization. Other defaults prepare native response values.
export const nestBodyCodecs: readonly BodyCodec<unknown>[] = [
	{
		match: (mediaType) =>
			mediaType === "application/json" || mediaType.endsWith("+json"),
		serialize: (value) => ({ body: value }),
	},
	{
		match: (mediaType) => mediaType === "application/x-www-form-urlencoded",
		serialize: (value, contentType) => {
			if (!(value instanceof URLSearchParams))
				throw new TypeError("Expected URLSearchParams body");
			return {
				body: new StreamableFile(Buffer.from(value.toString()), {
					type: contentType,
				}),
			};
		},
	},
	{
		match: (mediaType) => mediaType.startsWith("text/"),
		serialize: (value, contentType) => {
			if (typeof value !== "string")
				throw new TypeError("Expected string body");
			return {
				body: new StreamableFile(Buffer.from(value), { type: contentType }),
			};
		},
	},
	{
		match: () => true,
		serialize: (value, contentType) => {
			if (value instanceof Blob)
				return {
					body: new StreamableFile(
						// DOM and Node declare the same runtime stream with different types.
						Readable.fromWeb(
							value.stream() as unknown as NodeReadableStream<Uint8Array>,
						),
						{ type: contentType },
					),
				};
			if (value instanceof Uint8Array)
				return { body: new StreamableFile(value, { type: contentType }) };
			if (value instanceof Readable)
				return { body: new StreamableFile(value, { type: contentType }) };
			throw new TypeError("Expected Blob, Uint8Array, or Readable body");
		},
	},
];
