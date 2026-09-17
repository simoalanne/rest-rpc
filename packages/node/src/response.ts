import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { HttpRouteResult } from "@rest-rpc/server";
import type { BodyCodec, SerializedBody } from "@rest-rpc/core";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import { nodeBodyCodecs } from "./codecs.ts";

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
export async function writeNodeResponse(
	result: HttpRouteResult,
	res: ServerResponse,
	bodyCodecs: readonly BodyCodec<never>[] = [],
): Promise<void> {
	let serialized: SerializedBody | undefined;
	if (result.kind === "response" && result.body) {
		const { value, contentType } = result.body;
		const codec = resolveBodyCodec(normalizeMediaType(contentType), [
			...bodyCodecs,
			...nodeBodyCodecs,
		]);
		serialized = await codec!.serialize!(value, contentType);
		for (const [name, value] of Object.entries(serialized.headers ?? {})) {
			if (value !== undefined) res.setHeader(name, value);
		}
	}
	for (const [name, value] of Object.entries(result.headers ?? {})) {
		if (value !== undefined) res.setHeader(name, value);
	}
	if (result.kind === "stream") {
		return writeStreamResponse(result.body, res, result.status);
	}
	res.statusCode = result.status;
	if (!serialized) {
		res.end();
		return;
	}
	const contentType =
		serialized.contentType === undefined
			? result.body!.contentType
			: serialized.contentType;
	if (contentType === null) res.removeHeader("content-type");
	else res.setHeader("content-type", contentType);

	if (serialized.body instanceof Readable) {
		await pipeline(serialized.body, res);
	} else {
		res.end(serialized.body);
	}
}
