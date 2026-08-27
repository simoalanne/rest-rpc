import type { HttpRouteResult } from "./handleHttpRoute.ts";
import {
	type HttpRouteResultStreamMode,
	handleHttpRouteResult,
} from "./handleHttpRouteResult.ts";
import type { HttpHeaderValue } from "./headers.ts";
import { formatSseEvent, type SseEvent } from "./sse.ts";

const setHeader = (headers: Headers, name: string, value: HttpHeaderValue) => {
	if (Array.isArray(value)) {
		for (const entry of value) headers.append(name, String(entry));
		return;
	}

	if (value !== undefined) {
		headers.set(name, String(value));
	}
};

const createStreamResponse = (
	body: AsyncIterable<unknown>,
	status: number,
	headers: Headers,
	contentType: string,
	mode: HttpRouteResultStreamMode,
) => {
	headers.set("content-type", contentType);
	const encoder = new TextEncoder();
	const iterator = body[Symbol.asyncIterator]();

	const encodeChunk = (chunk: unknown) => {
		if (mode === "ndjson") {
			return encoder.encode(`${JSON.stringify(chunk)}\n`);
		}
		if (mode === "sse") {
			return encoder.encode(formatSseEvent(chunk as SseEvent<unknown>));
		}

		return typeof chunk === "string"
			? encoder.encode(chunk)
			: (chunk as Uint8Array);
	};

	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await iterator.next();
				if (done) {
					controller.close();
					return;
				}

				controller.enqueue(encodeChunk(value));
			} catch (error) {
				controller.error(error);
			}
		},
		async cancel() {
			await iterator.return?.();
		},
	});

	return new Response(stream, { status, headers });
};

/**
 * Converts a normalized HTTP route result into a Web `Response`.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#dispatch-adapters}
 */
export function createWebResponse(result: HttpRouteResult): Promise<Response> {
	const headers = new Headers();
	const setHeaderIfUnset = (name: string, value: string) => {
		if (!headers.has(name)) headers.set(name, value);
	};

	return handleHttpRouteResult(result, {
		setHeader: (name, value) => setHeader(headers, name, value),
		sendEmpty: (status) => new Response(null, { status, headers }),
		sendJson: (status, body) => {
			setHeaderIfUnset("content-type", "application/json");
			return new Response(JSON.stringify(body), { status, headers });
		},
		sendCustom: (status, body) =>
			new Response(body as BodyInit | null, { status, headers }),
		sendStream: ({ status, body, contentType, mode }) =>
			createStreamResponse(body, status, headers, contentType, mode),
	});
}
