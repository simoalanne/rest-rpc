import type { ErrorResponse } from "../pipeline/resolveRouteError.ts";
import { isAsyncIterable, type BodyCodecRegistry } from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { HttpRouteResult } from "../pipeline/handleHttpRoute.ts";
import { cancelBody } from "../pipeline/headResponse.ts";
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

/** Serializes a route result as a Fetch `Response`. A returned `Response` is sent as is. */
export const serializeFetchResult = (
	result: HttpRouteResult | Response,
	codecs: BodyCodecRegistry,
): MaybePromise<Response> => {
	if (result instanceof Response) return result;
	// `Response.json` serializes faster than the JSON codec, but only without
	// headers to set.
	if (
		result.body &&
		result.headers === undefined &&
		!result.cookies?.length &&
		result.body.contentType === "application/json" &&
		!(result.body.value instanceof FormData) &&
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
export const serializeFetchError = (error: ErrorResponse): Response =>
	toFetchResponse(serializeRouteErrorParts(error));

/** The response to a `HEAD` request: the `GET` response without its body, which is cancelled unread. */
export const withoutBody = (response: Response): Response => {
	void cancelBody(response.body);
	return new Response(null, response);
};
