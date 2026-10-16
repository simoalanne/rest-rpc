import type { BodyCodec } from "@rest-rpc/core";
import { defaultBodyCodecs } from "@rest-rpc/core/codecs";
import {
	serializeHttpRouteResult,
	type HttpRouteResult,
} from "@rest-rpc/server";

type HttpHeaderValue = NonNullable<HttpRouteResult["headers"]>[string];

const encodeResponseStream = async function* (
	body: AsyncIterable<string>,
): AsyncIterableIterator<Uint8Array> {
	const encoder = new TextEncoder();
	for await (const frame of body) yield encoder.encode(frame);
};

const setHeader = (headers: Headers, name: string, value: HttpHeaderValue) => {
	if (Array.isArray(value)) {
		for (const entry of value) headers.append(name, String(entry));
		return;
	}

	if (value !== undefined) {
		headers.set(name, String(value));
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
		setHeader(headers, name, value);
	}
	// Status and headers are committed with the returned Response before the stream
	// is read, so stream validation failures can only error the body stream.
	if (serialized.kind === "stream") {
		headers.set("content-type", "text/event-stream");
		return new Response(
			ReadableStream.from(encodeResponseStream(serialized.body)),
			{
				status: serialized.status,
				headers,
			},
		);
	}
	if (!serialized.body)
		return new Response(null, { status: serialized.status, headers });

	const { value, contentType } = serialized.body;
	if (contentType === null) {
		headers.delete("content-type");
	} else {
		headers.set("content-type", contentType);
	}
	return new Response(value as ConstructorParameters<typeof Response>[0], {
		status: serialized.status,
		headers,
	});
}
