import type { HttpRouteResult } from "./handleHttpRoute.ts";
import {
	type HttpRouteResultStreamMode,
	handleHttpRouteResult,
} from "./handleHttpRouteResult.ts";
import type { HttpHeaderValue } from "./headers.ts";

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

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const chunk of body) {
					if (mode === "ndjson") {
						controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
						continue;
					}

					controller.enqueue(
						typeof chunk === "string"
							? encoder.encode(chunk)
							: (chunk as Uint8Array),
					);
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
	});

	return new Response(stream, { status, headers });
};

export const createWebResponse = (
	result: HttpRouteResult,
): Promise<Response> => {
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
};
