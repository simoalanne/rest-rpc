import type { BodyCodec } from "@rest-rpc/core";
import {
	defaultBodyCodecs,
	isAsyncIterable,
	normalizeMediaType,
	resolveBodyCodec,
} from "@rest-rpc/core/codecs";
import type { RequestScalar } from "@rest-rpc/core/contract";
import type { HttpRouteResult } from "./handleHttpRoute.ts";

// SSE is a special case that should override all codecs and serialize as-is, since the body is already framed and encoded.
const sseCodec = {
	match: (mediaType: string) => mediaType === "text/event-stream",
	serialize: (body: unknown) => ({ body }),
};

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
 * the first matching body codec. The result's headers override codec headers.
 *
 * @remarks `bodyCodecs` take precedence over the default codecs.
 */
export async function serializeHttpRouteResult(
	result: HttpRouteResult,
	bodyCodecs: readonly BodyCodec[],
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
	const codec = resolveBodyCodec(normalizeMediaType(contentType), [
		sseCodec,
		...bodyCodecs,
		...defaultBodyCodecs,
	]);
	if (!codec?.serialize) {
		throw new Error("No serializer for declared content-type");
	}
	const serialized = await codec.serialize(value, contentType);
	setHeaders(serialized.headers);
	setHeaders(result.headers);
	const bodyContentType =
		serialized.contentType === undefined ? contentType : serialized.contentType;
	if (bodyContentType === null) {
		headers.delete("content-type");
	} else {
		headers.set("content-type", bodyContentType);
	}
	return new Response(toBodyInit(serialized.body), {
		status: result.status,
		headers,
	});
}
