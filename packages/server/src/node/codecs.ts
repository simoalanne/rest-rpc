import type { BodyCodec } from "@rest-rpc/core";
import type { IncomingMessage } from "node:http";
import { isAsyncIterable } from "../pipeline/handleHttpRoute.ts";

/**
 * The request body a Node codec's `deserialize` receives.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node#request-and-response-bodies}
 */
export type NodeRequestBody = {
	/**
	 * Body chunks read from `request`. Iterating fails once the body exceeds
	 * `requestBodyLimit`.
	 */
	body: AsyncIterable<Buffer>;
	/** The native request, for headers such as `content-type`. */
	request: IncomingMessage;
};

const readBytes = async (body: AsyncIterable<Buffer>) => {
	const chunks: Buffer[] = [];
	for await (const chunk of body) chunks.push(chunk);
	return Buffer.concat(chunks);
};

// TextDecoder strips a BOM like Fetch `text()` does.
const readText = async (body: AsyncIterable<Buffer>) =>
	new TextDecoder().decode(await readBytes(body));

/**
 * Default codecs reading Node request bodies and producing bodies for Node
 * writes. Decoded values match the Fetch defaults.
 */
export const nodeBodyCodecs: readonly BodyCodec<NodeRequestBody>[] = [
	{
		match: (mediaType) =>
			mediaType === "application/json" || mediaType.endsWith("+json"),
		serialize: (value) => {
			const json = JSON.stringify(value);
			if (json === undefined) throw new TypeError("Expected a JSON body");
			return { body: Buffer.from(json) };
		},
		deserialize: async ({ body }) => JSON.parse(await readText(body)),
	},
	{
		match: (mediaType) => mediaType === "application/x-www-form-urlencoded",
		serialize: (value) => {
			if (!(value instanceof URLSearchParams))
				throw new TypeError("Expected URLSearchParams body");
			return { body: Buffer.from(value.toString()) };
		},
		deserialize: async ({ body }) => new URLSearchParams(await readText(body)),
	},
	{
		match: (mediaType) => mediaType === "multipart/form-data",
		// Undici accepts async iterable bodies, which its types do not declare.
		deserialize: ({ body, request }) =>
			new Response(body as unknown as ReadableStream<Uint8Array>, {
				headers: { "content-type": request.headers["content-type"] ?? "" },
			}).formData(),
	},
	{
		match: (mediaType) => mediaType.startsWith("text/"),
		serialize: (value) => {
			if (typeof value !== "string")
				throw new TypeError("Expected string body");
			return { body: Buffer.from(value) };
		},
		deserialize: ({ body }) => readText(body),
	},
	{
		match: () => true,
		serialize: (value) => {
			if (value instanceof Blob) return { body: value.stream() };
			if (value instanceof Uint8Array || isAsyncIterable(value))
				return { body: value };
			throw new TypeError(
				"Expected Blob, Uint8Array, Readable, ReadableStream, or AsyncIterable body",
			);
		},
		deserialize: async ({ body, request }) =>
			new Blob([await readBytes(body)], {
				type: request.headers["content-type"],
			}),
	},
];
