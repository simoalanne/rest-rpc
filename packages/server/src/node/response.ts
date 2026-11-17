import type { BodyCodecRegistry } from "@rest-rpc/core/codecs";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import type { HttpRouteResult } from "../pipeline/handleHttpRoute.ts";
import { cancelBody, toHeadResponse } from "../pipeline/headResponse.ts";
import { fromFetchResponse } from "../pipeline/rawResponse.ts";
import {
	serializeHttpResponseParts,
	type SerializedHttpResponse,
} from "../pipeline/serializeHttpRouteResult.ts";

// Sends each body as a Fetch `Response` would. The content type is already in
// the headers, except for `FormData`, whose multipart boundary Fetch generates.

const toBytes = (body: ArrayBuffer | ArrayBufferView): Uint8Array =>
	ArrayBuffer.isView(body)
		? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
		: Buffer.from(body);

const writeBytes = (
	response: ServerResponse,
	status: number,
	headers: OutgoingHttpHeaders,
	bytes: string | Uint8Array,
) => {
	response.writeHead(status, {
		...headers,
		"content-length":
			typeof bytes === "string" ? Buffer.byteLength(bytes) : bytes.byteLength,
	});
	response.end(bytes);
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
		// A client that disconnects ends the pipeline early, which is not a failure.
		if (
			(error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE"
		) {
			throw error;
		}
	}
};

/**
 * Writes serialized response parts to a Node `ServerResponse`, without the
 * body for a `HEAD` request.
 */
export const writeNodeResponse = async (
	response: ServerResponse,
	parts: SerializedHttpResponse,
): Promise<void> => {
	const { status, headers, body } =
		response.req.method === "HEAD" ? await toHeadResponse(parts) : parts;
	if (response.destroyed) return cancelBody(body);
	if (body === null) {
		response.writeHead(status, headers);
		response.end();
		return;
	}
	if (typeof body === "string") {
		return writeBytes(response, status, headers, body);
	}
	if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
		return writeBytes(response, status, headers, toBytes(body));
	}
	if (body instanceof URLSearchParams) {
		return writeBytes(response, status, headers, body.toString());
	}
	if (body instanceof Blob) {
		return writeStream(
			response,
			status,
			{ ...headers, "content-length": body.size },
			body.stream(),
		);
	}
	if (body instanceof FormData) {
		const encoded = new Response(body);
		return writeStream(
			response,
			status,
			{ ...headers, "content-type": encoded.headers.get("content-type")! },
			encoded.body!,
		);
	}
	// Every other body is a stream, so a new kind of body is a type error here.
	return writeStream(
		response,
		status,
		headers,
		body satisfies AsyncIterable<unknown>,
	);
};

/** Serializes a route result and writes it to a Node `ServerResponse`. A returned `Response` is written as is. */
export const writeNodeResult = async (
	response: ServerResponse,
	result: HttpRouteResult | Response,
	codecs: BodyCodecRegistry,
): Promise<void> =>
	writeNodeResponse(
		response,
		result instanceof Response
			? fromFetchResponse(result)
			: await serializeHttpResponseParts(result, codecs),
	);
