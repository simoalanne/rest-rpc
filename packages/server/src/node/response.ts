import { isAsyncIterable, type BodyValue } from "@rest-rpc/core/codecs";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import type {
	HeaderSink,
	SerializedHttpResponse,
} from "../pipeline/serializeHttpRouteResult.ts";

/** Response headers as the plain object `writeHead` takes. */
export class NodeHeaders implements HeaderSink {
	readonly values: OutgoingHttpHeaders = {};

	set(name: string, value: string): void {
		this.values[name.toLowerCase()] = value;
	}

	append(name: "set-cookie", value: string): void {
		const cookies = this.values[name];
		if (Array.isArray(cookies)) cookies.push(value);
		else this.values[name] = [value];
	}

	delete(name: string): void {
		delete this.values[name.toLowerCase()];
	}
}

export const createNodeHeaders = () => new NodeHeaders();

/**
 * A body written at once, with the content type Fetch would send for its value
 * when the codec sets none.
 */
type BytesBody = { bytes: string | Uint8Array; contentType?: string };

/** A response body as Node writes it: bytes, or a stream to pipe. */
type NodeBody = BytesBody | { stream: AsyncIterable<unknown> };

const toBytes = (body: ArrayBuffer | ArrayBufferView): Uint8Array =>
	ArrayBuffer.isView(body)
		? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
		: Buffer.from(body);

// `Blob` and `FormData` are rare, so the Fetch `Response` encodes them and sets
// the content type it would send, such as with the multipart boundary.
const encodeWithFetch = async (body: Blob | FormData): Promise<BytesBody> => {
	const response = new Response(body);
	return {
		bytes: Buffer.from(await response.arrayBuffer()),
		contentType: response.headers.get("content-type") ?? undefined,
	};
};

const toNodeBody = (body: BodyValue): NodeBody | Promise<NodeBody> => {
	if (typeof body === "string") {
		return { bytes: body, contentType: "text/plain;charset=UTF-8" };
	}
	if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
		return { bytes: toBytes(body) };
	}
	if (body instanceof URLSearchParams) {
		return {
			bytes: body.toString(),
			contentType: "application/x-www-form-urlencoded;charset=UTF-8",
		};
	}
	if (body instanceof ReadableStream || isAsyncIterable(body)) {
		return { stream: body as AsyncIterable<unknown> };
	}
	return encodeWithFetch(body);
};

const writeBytes = (
	response: ServerResponse,
	status: number,
	headers: OutgoingHttpHeaders,
	body: BytesBody,
) => {
	if (body.contentType !== undefined)
		headers["content-type"] ??= body.contentType;
	headers["content-length"] =
		typeof body.bytes === "string"
			? Buffer.byteLength(body.bytes)
			: body.bytes.byteLength;
	response.writeHead(status, headers);
	response.end(body.bytes);
};

const writeStream = async (
	response: ServerResponse,
	status: number,
	headers: OutgoingHttpHeaders,
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
	{ status, headers, body }: SerializedHttpResponse<NodeHeaders>,
): Promise<void> => {
	if (response.destroyed) {
		await cancel(body);
		return;
	}
	if (body === null) {
		response.writeHead(status, headers.values);
		response.end();
		return;
	}
	const nodeBody = await toNodeBody(body);
	if ("stream" in nodeBody) {
		await writeStream(response, status, headers.values, nodeBody.stream);
	} else {
		writeBytes(response, status, headers.values, nodeBody);
	}
};

/** Writes the same parts for every request, encoding the body once. */
export const createStaticWriter = (
	parts: SerializedHttpResponse<NodeHeaders>,
) => {
	let encoded: Promise<BytesBody> | undefined;
	return async (response: ServerResponse): Promise<void> => {
		if (parts.body === null) {
			response.writeHead(parts.status, parts.headers.values);
			response.end();
			return;
		}
		// Static bodies are never streams.
		encoded ??= Promise.resolve(toNodeBody(parts.body) as BytesBody);
		// The headers are shared, so each response writes a copy.
		writeBytes(
			response,
			parts.status,
			{ ...parts.headers.values },
			await encoded,
		);
	};
};
