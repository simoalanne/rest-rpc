import type { ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import {
	isAsyncIterable,
	type HttpRouteResult,
} from "../pipeline/handleHttpRoute.ts";
import { serializeHttpRouteResult } from "../pipeline/serializeHttpRouteResult.ts";
import type { BodyCodec } from "@rest-rpc/core";
import { nodeBodyCodecs, type NodeRequestBody } from "./codecs.ts";

/** Writes a normalized HTTP result to a Node ServerResponse. */
export async function writeNodeResponse(
	result: HttpRouteResult,
	res: ServerResponse,
	bodyCodecs: readonly BodyCodec<NodeRequestBody>[] = [],
): Promise<void> {
	const serialized = await serializeHttpRouteResult(
		result,
		bodyCodecs,
		nodeBodyCodecs,
	);
	for (const [name, value] of Object.entries(serialized.headers)) {
		if (value !== undefined) res.setHeader(name, value);
	}
	res.statusCode = serialized.status;
	if (!serialized.body) {
		res.end();
		return;
	}
	const { value, contentType } = serialized.body;
	if (contentType === null) res.removeHeader("content-type");
	else res.setHeader("content-type", contentType);

	if (!isAsyncIterable(value)) {
		res.end(value);
		return;
	}
	try {
		await pipeline(value, res);
	} catch (error) {
		if (
			(error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE"
		) {
			throw error;
		}
	}
}
