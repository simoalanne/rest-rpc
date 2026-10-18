import type { BodyCodec } from "@rest-rpc/core";
import { defaultBodyCodecs } from "@rest-rpc/core/codecs";
import {
	isAsyncIterable,
	type HttpRouteResult,
} from "../pipeline/handleHttpRoute.ts";
import { serializeHttpRouteResult } from "../pipeline/serializeHttpRouteResult.ts";

const encodeChunks = async function* (
	body: AsyncIterable<unknown>,
): AsyncIterableIterator<unknown> {
	const encoder = new TextEncoder();
	for await (const chunk of body) {
		yield typeof chunk === "string" ? encoder.encode(chunk) : chunk;
	}
};

/**
 * Creates a Fetch `Response` from a normalized rest-rpc route result.
 */
export async function createFetchResponse(
	result: HttpRouteResult,
	bodyCodecs: readonly BodyCodec[] = [],
): Promise<Response> {
	const serialized = await serializeHttpRouteResult(
		result,
		bodyCodecs,
		defaultBodyCodecs,
	);
	const headers = new Headers();
	for (const [name, value] of Object.entries(serialized.headers)) {
		if (value !== undefined) headers.set(name, String(value));
	}
	if (!serialized.body)
		return new Response(null, { status: serialized.status, headers });

	const { value, contentType } = serialized.body;
	if (contentType === null) {
		headers.delete("content-type");
	} else {
		headers.set("content-type", contentType);
	}
	return new Response(
		(isAsyncIterable(value)
			? ReadableStream.from(encodeChunks(value))
			: value) as ConstructorParameters<typeof Response>[0],
		{ status: serialized.status, headers },
	);
}
