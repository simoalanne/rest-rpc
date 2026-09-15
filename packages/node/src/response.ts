import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { handleHttpRouteResult, type HttpRouteResult } from "@rest-rpc/server";

const formatResponseStreamChunk = (chunk: unknown) =>
	`${JSON.stringify(chunk)}\n`;

const frameResponseStream = async function* (
	body: AsyncIterable<unknown>,
): AsyncIterableIterator<unknown> {
	for await (const chunk of body) {
		yield formatResponseStreamChunk(chunk);
	}
};

/** Creates a Node readable stream with rest-rpc response framing. */
export function createNodeResponseStream(
	body: AsyncIterable<unknown>,
): Readable {
	return Readable.from(frameResponseStream(body));
}

/** Writes a response stream to a Node HTTP response. */
export async function writeStreamResponse(
	body: AsyncIterable<unknown>,
	res: ServerResponse,
	status: number,
	contentType = "application/x-ndjson",
): Promise<void> {
	res.statusCode = status;
	res.setHeader("content-type", contentType);
	try {
		await pipeline(createNodeResponseStream(body), res);
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
		sendStream: ({ status, body, contentType }) =>
			writeStreamResponse(body, res, status, contentType),
	});
}
