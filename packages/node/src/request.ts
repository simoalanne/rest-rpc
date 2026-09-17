import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
/** Parses a Node request target without depending on the Host header. */
export function parseRequestTarget(request: IncomingMessage): URL {
	return new URL(request.url ?? "/", "http://localhost");
}

export const toFetchRequest = (
	request: IncomingMessage,
	signal: AbortSignal,
) => {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value))
			for (const entry of value) headers.append(name, entry);
		else if (value !== undefined) headers.set(name, value);
	}
	const method = request.method ?? "GET";
	const init: RequestInit & { duplex?: "half" } = { method, headers, signal };
	if (method !== "GET" && method !== "HEAD") {
		init.body = Readable.toWeb(request) as ReadableStream;
		init.duplex = "half";
	}
	return new Request(parseRequestTarget(request), init);
};
