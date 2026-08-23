import type { HttpRouteResult } from "./handleHttpRoute.ts";
import type { HttpHeaderValue } from "./headers.ts";

type MaybePromise<T> = T | Promise<T>;

export type HttpRouteResultStreamMode = "ndjson" | "raw";

export type HttpRouteResultWriter<TResponse> = {
	setHeader(name: string, value: HttpHeaderValue): void;
	sendEmpty(status: number): MaybePromise<TResponse>;
	sendJson(status: number, body: unknown): MaybePromise<TResponse>;
	sendCustom(status: number, body: unknown): MaybePromise<TResponse>;
	sendStream(input: {
		status: number;
		body: AsyncIterable<unknown>;
		contentType: string;
		mode: HttpRouteResultStreamMode;
	}): MaybePromise<TResponse>;
};

export async function handleHttpRouteResult<TResponse>(
	result: HttpRouteResult,
	writer: HttpRouteResultWriter<TResponse>,
): Promise<TResponse> {
	for (const [name, value] of Object.entries(result.headers ?? {})) {
		if (value !== undefined) writer.setHeader(name, value);
	}

	if (result.kind === "empty") {
		return writer.sendEmpty(result.status);
	}

	if (result.kind === "stream") {
		return writer.sendStream({
			status: result.status,
			body: result.body,
			contentType: result.contentType ?? "application/x-ndjson",
			mode: result.contentType ? "raw" : "ndjson",
		});
	}

	if (result.kind === "custom") {
		writer.setHeader("content-type", result.contentType);
		return writer.sendCustom(result.status, result.body);
	}

	return writer.sendJson(result.status, result.body);
}
