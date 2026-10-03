import type { ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	serializeHttpRouteResult,
	type HttpRouteResult,
} from "@rest-rpc/server";
import type { BodyCodec } from "@rest-rpc/core";
import { nodeBodyCodecs } from "./codecs.ts";

/** Writes a response stream to a Node HTTP response. */
export async function writeStreamResponse(
	body: AsyncIterable<string>,
	res: ServerResponse,
	status: number,
): Promise<void> {
	res.statusCode = status;
	res.setHeader("content-type", "text/event-stream");
	try {
		await pipeline(Readable.from(body), res);
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
	const serialized = await serializeHttpRouteResult(
		result,
		bodyCodecs,
		nodeBodyCodecs,
	);
	for (const [name, value] of Object.entries(serialized.headers)) {
		if (value !== undefined) res.setHeader(name, value);
	}
	if (serialized.kind === "stream") {
		return writeStreamResponse(serialized.body, res, serialized.status);
	}
	res.statusCode = serialized.status;
	if (!serialized.body) {
		res.end();
		return;
	}
	const { value, contentType } = serialized.body;
	if (contentType === null) res.removeHeader("content-type");
	else res.setHeader("content-type", contentType);

	if (value instanceof Readable) {
		await pipeline(value, res);
	} else {
		res.end(value);
	}
}
