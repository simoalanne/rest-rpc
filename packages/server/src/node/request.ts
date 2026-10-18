import type { IncomingMessage } from "node:http";
import type { RequestBodySource } from "../pipeline/deserializeRequestBody.ts";
import type { NodeRequestBody } from "./codecs.ts";

async function* limitBody(
	request: IncomingMessage,
	maxBytes: number,
	onOversized: () => void,
): AsyncGenerator<Buffer> {
	let bytes = 0;
	for await (const chunk of request as AsyncIterable<Buffer>) {
		bytes += chunk.byteLength;
		if (bytes > maxBytes) {
			onOversized();
			throw new Error("Request body too large");
		}
		yield chunk;
	}
}

/** Exposes a Node request body to codecs as size-limited chunks. */
export const nodeRequestBody = (
	request: IncomingMessage,
): RequestBodySource<NodeRequestBody> => ({
	contentType: request.headers["content-type"],
	contentLength: request.headers["content-length"],
	hasBody: request.method !== "GET" && request.method !== "HEAD",
	open: (maxBytes, onOversized) => ({
		body: limitBody(request, maxBytes, onOversized),
		request,
	}),
});
