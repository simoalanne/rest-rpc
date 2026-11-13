import type { RouteError } from "@rest-rpc/core";
import {
	isAsyncIterable,
	isSerializedBody,
	type BodyCodecRegistry,
	type BodyValue,
} from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { HttpRouteResult } from "./handleHttpRoute.ts";
import { mapMaybePromise } from "./maybePromise.ts";

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

const setHeaders = (
	headers: Headers,
	values: Record<string, unknown> | undefined,
	cookies: readonly string[] | undefined,
) => {
	for (const name in values) {
		const value = values[name];
		if (value !== undefined) headers.set(name, String(value));
	}
	for (const cookie of cookies ?? []) headers.append("set-cookie", cookie);
};

/** A serialized route result: the parts a `Response` is built from. */
export type SerializedHttpResponse = {
	status: number;
	headers: Headers;
	body: BodyValue | null;
};

/** The result's headers override the headers of a `SerializedBody` returned by the codec. */
export function serializeHttpResponseParts(
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
): MaybePromise<SerializedHttpResponse> {
	const { status } = result;
	if (!result.body) {
		const headers = new Headers();
		setHeaders(headers, result.headers, result.cookies);
		return { status, headers, body: null };
	}

	const { value, contentType } = result.body;
	return mapMaybePromise(codecs.serialize(value, contentType), (serialized) => {
		const headers = new Headers();
		if (isSerializedBody(serialized)) {
			serialized.headers.forEach((headerValue, name) =>
				headers.set(name, headerValue),
			);
			setHeaders(headers, result.headers, result.cookies);
			return { status, headers, body: serialized.body };
		}
		setHeaders(headers, result.headers, result.cookies);
		headers.set("content-type", contentType);
		return { status, headers, body: serialized };
	});
}

export function serializeHttpRouteResult(
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
): MaybePromise<Response> {
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
		({ status, headers, body }) =>
			new Response(body === null ? null : toBodyInit(body), {
				status,
				headers,
			}),
	);
}

/** The JSON body of an error response. */
const errorBody = ({ code, message, data }: RouteError) =>
	data === undefined ? { code, message } : { code, message, data };

/** Serializes an error as a JSON `{ code, message, data? }` response. */
export function serializeRouteError(error: RouteError): Response {
	const headers = new Headers();
	setHeaders(headers, error.headers as Record<string, unknown>, error.cookies);
	return Response.json(errorBody(error), { status: error.status, headers });
}
