import type { RouteError } from "@rest-rpc/core";
import { isAsyncIterable, type BodyCodecRegistry } from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { HttpRouteResult } from "../pipeline/handleHttpRoute.ts";
import { mapMaybePromise } from "../pipeline/maybePromise.ts";
import {
	serializeHttpResponseParts,
	serializeRouteErrorParts,
	type ResponseHeaders,
	type SerializedHttpResponse,
} from "../pipeline/serializeHttpRouteResult.ts";

const encodeChunks = async function* (
	body: AsyncIterable<unknown>,
): AsyncIterableIterator<unknown> {
	const encoder = new TextEncoder();
	for await (const chunk of body) {
		yield typeof chunk === "string" ? encoder.encode(chunk) : chunk;
	}
};

// Codecs may return views of a `SharedArrayBuffer`, which `BodyInit` omits.
const toBodyInit = (value: unknown) =>
	(isAsyncIterable(value) && !(value instanceof ReadableStream)
		? ReadableStream.from(encodeChunks(value))
		: value) as ConstructorParameters<typeof Response>[0];

const toFetchHeaders = (values: ResponseHeaders) => {
	const headers = new Headers();
	for (const name in values) {
		const value = values[name]!;
		if (typeof value === "string") headers.set(name, value);
		else for (const item of value) headers.append(name, item);
	}
	return headers;
};

/** Creates a Fetch `Response` from serialized response parts. */
export const toFetchResponse = ({
	status,
	headers,
	body,
}: SerializedHttpResponse): Response =>
	new Response(body === null ? null : toBodyInit(body), {
		status,
		headers: toFetchHeaders(headers),
	});

/** Serializes a route result as a Fetch `Response`. */
export const serializeFetchResult = (
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
): MaybePromise<Response> => {
	// `Response.json` serializes faster than the JSON codec, but only without
	// headers to set.
	if (
		result.body &&
		result.headers === undefined &&
		!result.cookies?.length &&
		result.body.contentType === "application/json" &&
		codecs.serializesJson(result.body.contentType)
	) {
		return Response.json(result.body.value, { status: result.status });
	}
	return mapMaybePromise(
		serializeHttpResponseParts(result, codecs),
		toFetchResponse,
	);
};

/** Serializes an error as a JSON `{ code, message, data? }` Fetch `Response`. */
export const serializeFetchError = (error: RouteError): Response =>
	toFetchResponse(serializeRouteErrorParts(error));
