import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { defaultBodyParser as parseFetchBody } from "@rest-rpc/fetch";

/** Replacement Node request body decoder. */
export type NodeBodyParser = (
	request: IncomingMessage,
) => unknown | Promise<unknown>;

/** Parses a Node request target without depending on the Host header. */
export function parseRequestTarget(request: IncomingMessage): URL {
	return new URL(request.url ?? "/", "http://localhost");
}

const toFetchRequest = (request: IncomingMessage) => {
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value))
			for (const entry of value) headers.append(name, entry);
		else if (value !== undefined) headers.set(name, value);
	}
	const method = request.method ?? "GET";
	const init: RequestInit & { duplex?: "half" } = { method, headers };
	if (method !== "GET" && method !== "HEAD") {
		init.body = Readable.toWeb(request) as ReadableStream;
		init.duplex = "half";
	}
	return new Request(parseRequestTarget(request), init);
};

/** Decodes a Node request body through the shared Fetch body parser. */
export function defaultBodyParser(request: IncomingMessage) {
	return parseFetchBody(toFetchRequest(request));
}
