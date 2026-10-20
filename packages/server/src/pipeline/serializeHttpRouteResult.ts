import {
	isAsyncIterable,
	isSerializedBody,
	type BodyCodecRegistry,
} from "@rest-rpc/core/codecs";
import type { RequestScalar } from "@rest-rpc/core/contract";
import type { HttpRouteResult } from "./handleHttpRoute.ts";

const encodeChunks = async function* (
	body: AsyncIterable<unknown>,
): AsyncIterableIterator<unknown> {
	const encoder = new TextEncoder();
	for await (const chunk of body) {
		yield typeof chunk === "string" ? encoder.encode(chunk) : chunk;
	}
};

const toBodyInit = (value: unknown) =>
	(isAsyncIterable(value) && !(value instanceof ReadableStream)
		? ReadableStream.from(encodeChunks(value))
		: value) as ConstructorParameters<typeof Response>[0];

/**
 * Serializes a route result into a Fetch `Response`, encoding the body with
 * the codec for its media type. The result's headers override the headers of
 * a `SerializedBody` returned by the codec.
 */
export async function serializeHttpRouteResult(
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
): Promise<Response> {
	const headers = new Headers();
	const setHeaders = (values?: Record<string, RequestScalar | undefined>) => {
		for (const [name, value] of Object.entries(values ?? {})) {
			if (value !== undefined) headers.set(name, String(value));
		}
	};
	if (!result.body) {
		setHeaders(result.headers);
		return new Response(null, { status: result.status, headers });
	}

	const { value, contentType } = result.body;
	const serialized = await codecs.serialize(value, contentType);
	if (isSerializedBody(serialized)) {
		serialized.headers.forEach((headerValue, name) =>
			headers.set(name, headerValue),
		);
		setHeaders(result.headers);
		return new Response(toBodyInit(serialized.body), {
			status: result.status,
			headers,
		});
	}
	setHeaders(result.headers);
	headers.set("content-type", contentType);
	return new Response(toBodyInit(serialized), {
		status: result.status,
		headers,
	});
}
