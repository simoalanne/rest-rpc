import type { IncomingMessage } from "node:http";
import {
	isNoBody,
	type BaseRouteDeclaration,
	type RequestBodySchema,
} from "@rest-rpc/core/contract";
import { defaultParseBody as parseFetchBody } from "@rest-rpc/fetch";

/** Input for a Node request body parser; custom parsers may use preprocessed request data. */
export type NodeRouteParseBodyInput = {
	request: IncomingMessage;
	route: BaseRouteDeclaration;
	body?: RequestBodySchema;
};
/** Replacement Node request body decoder. */
export type NodeRouteParseBody = (
	input: NodeRouteParseBodyInput,
) => unknown | Promise<unknown>;

/** Parses a Node request target without depending on the Host header. */
export function parseRequestTarget(request: IncomingMessage): URL {
	return new URL(request.url ?? "/", "http://localhost");
}

/** Buffers and decodes declared Node bodies, including Fetch-based multipart parsing. */
export async function defaultParseBody({
	request,
	route,
	body,
}: NodeRouteParseBodyInput): Promise<unknown> {
	if (!body || isNoBody(body)) return undefined;
	const chunks: Uint8Array[] = [];
	for await (const chunk of request)
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value))
			for (const entry of value) headers.append(name, entry);
		else if (value !== undefined) headers.set(name, value);
	}
	return parseFetchBody({
		request: new Request("http://localhost", {
			method: "POST",
			headers,
			body: Buffer.concat(chunks),
		}),
		route,
		body,
	});
}
