import type { BodyCodec, SerializedBody } from "@rest-rpc/core";
import {
	defaultBodyCodecs,
	normalizeMediaType,
	resolveBodyCodec,
} from "@rest-rpc/core/codecs";
import type { HttpRouteResult } from "@rest-rpc/server";

type HttpHeaderValue = string | number | readonly string[] | undefined;

const encodeResponseStream = async function* (
	body: AsyncIterable<unknown>,
): AsyncIterableIterator<Uint8Array> {
	const encoder = new TextEncoder();

	for await (const chunk of body) {
		yield encoder.encode(`${JSON.stringify(chunk)}\n`);
	}
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

const createStreamResponse = (
	body: AsyncIterable<unknown>,
	status: number,
	headers: Headers,
	contentType: string,
) => {
	headers.set("content-type", contentType);
	const stream = ReadableStream.from(encodeResponseStream(body));

	return new Response(stream, { status, headers });
};

/**
 * Creates a Fetch `Response` from a normalized rest-rpc route result.
 */
export async function createFetchResponse(
	result: HttpRouteResult,
	bodyCodecs: readonly BodyCodec<never>[] = [],
): Promise<Response> {
	const headers = new Headers();
	let serialized: SerializedBody | undefined;
	if (result.kind === "response" && result.body) {
		const { value, contentType } = result.body;
		const codec = resolveBodyCodec(normalizeMediaType(contentType), [
			...bodyCodecs,
			...defaultBodyCodecs,
		]);
		if (!codec?.serialize) {
			throw new Error("No serializer for declared content-type");
		}
		serialized = await codec.serialize(value, contentType);
		for (const [name, value] of Object.entries(serialized.headers ?? {})) {
			setHeader(headers, name, value);
		}
	}
	for (const [name, value] of Object.entries(result.headers ?? {})) {
		setHeader(headers, name, value);
	}
	if (result.kind === "stream") {
		return createStreamResponse(
			result.body,
			result.status,
			headers,
			"application/x-ndjson",
		);
	}
	if (!serialized)
		return new Response(null, { status: result.status, headers });

	const contentType =
		serialized.contentType === undefined
			? result.body?.contentType
			: serialized.contentType;
	if (contentType === null) {
		headers.delete("content-type");
	} else if (contentType !== undefined) {
		headers.set("content-type", contentType);
	}
	return new Response(
		serialized.body as ConstructorParameters<typeof Response>[0],
		{ status: result.status, headers },
	);
}
