import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	handleHttpRouteResult,
	type HttpRouteResult,
	type HttpRouteResultStreamMode,
} from "@rest-rpc/server";

const formatResponseStreamChunk = (
	chunk: unknown,
	mode: HttpRouteResultStreamMode,
) => {
	if (mode === "ndjson") return `${JSON.stringify(chunk)}\n`;
	return chunk instanceof Uint8Array ? chunk : String(chunk);
};

const frameResponseStream = async function* (
	body: AsyncIterable<unknown>,
	mode: HttpRouteResultStreamMode,
): AsyncIterableIterator<unknown> {
	for await (const chunk of body) {
		yield formatResponseStreamChunk(chunk, mode);
	}
};

/** Creates a Node readable stream with rest-rpc response framing. */
export function createNodeResponseStream(
	body: AsyncIterable<unknown>,
	mode: HttpRouteResultStreamMode = "ndjson",
): Readable {
	return Readable.from(frameResponseStream(body, mode));
}

/** Writes a response stream to a Node HTTP response. */
export async function writeStreamResponse(
	body: AsyncIterable<unknown>,
	res: ServerResponse,
	status: number,
	contentType = "application/x-ndjson",
	mode: HttpRouteResultStreamMode = "ndjson",
): Promise<void> {
	res.statusCode = status;
	res.setHeader("content-type", contentType);
	try {
		await pipeline(createNodeResponseStream(body, mode), res);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE")
			throw error;
	}
}

/** Writes a normalized HTTP result to a Node ServerResponse. */
export function writeNodeResponse(
	result: HttpRouteResult,
	res: ServerResponse,
): Promise<void> {
	return handleHttpRouteResult(result, {
		setHeader: (name, value) => {
			if (value !== undefined) res.setHeader(name, value);
		},
		sendEmpty: (status) => {
			res.statusCode = status;
			res.end();
		},
		sendJson: (status, body) => {
			const json = JSON.stringify(body);
			res.statusCode = status;
			if (!res.hasHeader("content-type"))
				res.setHeader("content-type", "application/json");
			res.end(json);
		},
		sendCustom: (status, body) => {
			res.statusCode = status;
			res.end(body instanceof Uint8Array ? body : String(body));
		},
		sendStream: ({ status, body, contentType, mode }) =>
			writeStreamResponse(body, res, status, contentType, mode),
	});
}
