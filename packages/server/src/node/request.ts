import type { IncomingBody } from "@rest-rpc/core/codecs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { bodyAlreadyRead, type RequestReader } from "../pipeline/dispatch.ts";

// A body is present only when framed by content-length or transfer-encoding.
export const hasBody = (request: IncomingMessage) =>
	request.method !== "GET" &&
	request.method !== "HEAD" &&
	(request.headers["transfer-encoding"] !== undefined ||
		Number(request.headers["content-length"]) > 0);

/** Aborts when the response closes before it is fully written. */
export const createRequestSignal = (response: ServerResponse): AbortSignal => {
	const controller = new AbortController();
	const close = () => !response.writableFinished && controller.abort();
	if (response.closed) close();
	else response.once("close", close);
	return controller.signal;
};

// Express removes the mount path from `req.url` and keeps the full request
// target in `originalUrl`.
export const readRequestTarget = (request: IncomingMessage) =>
	(request as IncomingMessage & { originalUrl?: string }).originalUrl ??
	request.url ??
	"/";

const emptyBuffer = Buffer.alloc(0);

const readBuffer = (request: IncomingMessage) =>
	new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.once("end", () =>
			resolve(chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks)),
		);
		request.once("error", reject);
	});

const utf8Bom = 0xfeff;

/** Reads a Node request body once, the first time a codec asks for it. */
const createNodeBody = (
	request: IncomingMessage,
	contentType: string,
): IncomingBody => {
	const framed = hasBody(request);
	let buffer: Promise<Buffer> | undefined;
	let stream: ReadableStream<Uint8Array> | null | undefined;
	const read = () =>
		(buffer ??= framed ? readBuffer(request) : Promise.resolve(emptyBuffer));
	// Decoded like Fetch `text()`, which drops a byte order mark.
	const text = async () => {
		const decoded = (await read()).toString("utf8");
		return decoded.charCodeAt(0) === utf8Bom ? decoded.slice(1) : decoded;
	};
	return {
		text,
		json: async () => JSON.parse(await text()),
		arrayBuffer: async () => {
			const bytes = await read();
			return bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength,
			) as ArrayBuffer;
		},
		blob: async () =>
			new Blob([(await read()) as Uint8Array<ArrayBuffer>], {
				type: contentType,
			}),
		get body() {
			stream ??= framed
				? ReadableStream.from(request as AsyncIterable<Uint8Array>)
				: null;
			return stream;
		},
	};
};

const readNodeBody = (request: IncomingMessage, contentType: string) => {
	if (request.readableDidRead || request.readableEnded) {
		throw bodyAlreadyRead();
	}
	return createNodeBody(request, contentType);
};

// Node joins repeated headers itself, except `set-cookie`, which is an array.
const readNodeHeaders = (request: IncomingMessage) => {
	const headers: Record<string, string> = {};
	const values = request.headers;
	for (const name in values) {
		const value = values[name];
		if (value !== undefined) {
			headers[name] = typeof value === "string" ? value : value.join(", ");
		}
	}
	return headers;
};

export const nodeRequestReader: RequestReader<IncomingMessage> = {
	url: readRequestTarget,
	contentType: (request) => request.headers["content-type"] ?? "",
	headers: readNodeHeaders,
	body: readNodeBody,
};
