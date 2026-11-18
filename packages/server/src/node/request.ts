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

const bodyUsed = () => new TypeError("The request body was already read.");

/**
 * Reads a Node request body once, the first time a codec asks for it. A class
 * keeps the methods on the prototype, so a request allocates one object. Like
 * a Fetch body, it can be read once, since every read consumes the request.
 */
class NodeBody implements IncomingBody {
	#request: IncomingMessage;
	#contentType: string;
	#framed: boolean;
	#used = false;
	#stream: ReadableStream<Uint8Array> | null | undefined;

	constructor(request: IncomingMessage, contentType: string) {
		this.#request = request;
		this.#contentType = contentType;
		this.#framed = hasBody(request);
	}

	#read(): Promise<Buffer> {
		if (this.#used) return Promise.reject(bodyUsed());
		this.#used = true;
		return this.#framed
			? readBuffer(this.#request)
			: Promise.resolve(emptyBuffer);
	}

	// Decoded like Fetch `text()`, which drops a byte order mark.
	async text(): Promise<string> {
		const decoded = (await this.#read()).toString("utf8");
		return decoded.charCodeAt(0) === utf8Bom ? decoded.slice(1) : decoded;
	}

	async json(): Promise<unknown> {
		return JSON.parse(await this.text());
	}

	// A buffer that owns its whole memory is returned without a copy. Small
	// buffers are slices of a shared pool, so they are copied.
	async arrayBuffer(): Promise<ArrayBuffer> {
		const bytes = await this.#read();
		return (
			bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
				? bytes.buffer
				: bytes.buffer.slice(
						bytes.byteOffset,
						bytes.byteOffset + bytes.byteLength,
					)
		) as ArrayBuffer;
	}

	async blob(): Promise<Blob> {
		return new Blob([(await this.#read()) as Uint8Array<ArrayBuffer>], {
			type: this.#contentType,
		});
	}

	// Parsed like a Fetch body, with the content type that carries the
	// multipart boundary.
	async formData(): Promise<FormData> {
		return new Response((await this.#read()) as Uint8Array<ArrayBuffer>, {
			headers: { "content-type": this.#contentType },
		}).formData();
	}

	// The stream is created once and returned again, as on a Fetch body.
	get body(): ReadableStream<Uint8Array> | null {
		if (this.#stream !== undefined) return this.#stream;
		if (this.#used) throw bodyUsed();
		this.#used = true;
		return (this.#stream = this.#framed
			? ReadableStream.from(this.#request as AsyncIterable<Uint8Array>)
			: null);
	}
}

const readNodeBody = (request: IncomingMessage, contentType: string) => {
	if (request.readableDidRead || request.readableEnded) {
		throw bodyAlreadyRead();
	}
	return new NodeBody(request, contentType);
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
