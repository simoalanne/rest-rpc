import type { RouteError } from "@rest-rpc/core";
import {
	isAsyncIterable,
	type BodyCodecRegistry,
	type BodyValue,
} from "@rest-rpc/core/codecs";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import type { HttpRouteResult } from "../pipeline/handleHttpRoute.ts";
import {
	serializeHttpResponseParts,
	serializeRouteErrorParts,
	type ResponseHeaders,
	type SerializedHttpResponse,
} from "../pipeline/serializeHttpRouteResult.ts";

const toBytes = (body: ArrayBuffer | ArrayBufferView): Uint8Array =>
	ArrayBuffer.isView(body)
		? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
		: Buffer.from(body);

const writeBytes = (
	response: ServerResponse,
	status: number,
	headers: ResponseHeaders,
	bytes: string | Uint8Array,
	// The content type Fetch would send for the body when the codec sets none.
	contentType?: string,
) => {
	// Static responses share their headers, so each response writes a copy.
	const outgoing: OutgoingHttpHeaders = { ...headers };
	if (contentType !== undefined) outgoing["content-type"] ??= contentType;
	outgoing["content-length"] =
		typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.byteLength;
	response.writeHead(status, outgoing);
	response.end(bytes);
};

const writeStream = async (
	response: ServerResponse,
	status: number,
	headers: ResponseHeaders,
	stream: AsyncIterable<unknown>,
) => {
	response.writeHead(status, headers);
	// Streams such as server-sent events may not write for a while, so the
	// client receives the headers first.
	response.flushHeaders();
	try {
		await pipeline(stream, response);
	} catch (error) {
		if (
			(error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE"
		) {
			throw error;
		}
	}
};

const cancel = async (body: BodyValue | null) => {
	if (body instanceof ReadableStream) await body.cancel();
	else if (isAsyncIterable(body)) await body[Symbol.asyncIterator]().return?.();
};

/** Writes serialized response parts to a Node `ServerResponse`. */
export const writeNodeResponse = async (
	response: ServerResponse,
	{ status, headers, body }: SerializedHttpResponse,
): Promise<void> => {
	if (response.destroyed) return cancel(body);
	if (body === null) {
		response.writeHead(status, headers);
		response.end();
	} else if (typeof body === "string") {
		writeBytes(response, status, headers, body, "text/plain;charset=UTF-8");
	} else if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
		writeBytes(response, status, headers, toBytes(body));
	} else if (body instanceof URLSearchParams) {
		writeBytes(
			response,
			status,
			headers,
			body.toString(),
			"application/x-www-form-urlencoded;charset=UTF-8",
		);
	} else if (body instanceof ReadableStream || isAsyncIterable(body)) {
		await writeStream(
			response,
			status,
			headers,
			body as AsyncIterable<unknown>,
		);
	} else {
		// `Blob` and `FormData` are rare, so a Fetch `Response` encodes them and
		// sets the content type it would send, such as with the multipart boundary.
		const encoded = new Response(body);
		writeBytes(
			response,
			status,
			headers,
			Buffer.from(await encoded.arrayBuffer()),
			encoded.headers.get("content-type") ?? undefined,
		);
	}
};

/** Serializes a route result and writes it to a Node `ServerResponse`. */
export const writeNodeResult = async (
	response: ServerResponse,
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
): Promise<void> =>
	writeNodeResponse(response, await serializeHttpResponseParts(result, codecs));

/** Writes an error as a JSON `{ code, message, data? }` response. */
export const writeNodeError = (
	response: ServerResponse,
	error: RouteError,
): Promise<void> =>
	writeNodeResponse(response, serializeRouteErrorParts(error));
