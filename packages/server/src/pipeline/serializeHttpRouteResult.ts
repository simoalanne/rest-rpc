import type { RouteError } from "@rest-rpc/core";
import {
	isAsyncIterable,
	isSerializedBody,
	type BodyCodecRegistry,
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

const setHeaders = (headers: Headers, values?: Record<string, unknown>) => {
	for (const name in values) {
		const value = values[name];
		if (value !== undefined) headers.set(name, String(value));
	}
};

/** The result's headers override the headers of a `SerializedBody` returned by the codec. */
export function serializeHttpRouteResult(
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
): MaybePromise<Response> {
	if (!result.body) {
		const headers = new Headers();
		setHeaders(headers, result.headers);
		return new Response(null, { status: result.status, headers });
	}

	const { value, contentType } = result.body;
	// `Response.json` serializes faster than the JSON codec, but only without
	// headers to set.
	if (
		result.headers === undefined &&
		contentType === "application/json" &&
		codecs.serializesJson(contentType)
	) {
		return Response.json(value, { status: result.status });
	}

	return mapMaybePromise(codecs.serialize(value, contentType), (serialized) => {
		const headers = new Headers();
		if (isSerializedBody(serialized)) {
			serialized.headers.forEach((headerValue, name) =>
				headers.set(name, headerValue),
			);
			setHeaders(headers, result.headers);
			return new Response(toBodyInit(serialized.body), {
				status: result.status,
				headers,
			});
		}
		setHeaders(headers, result.headers);
		headers.set("content-type", contentType);
		return new Response(toBodyInit(serialized), {
			status: result.status,
			headers,
		});
	});
}

/** The JSON body of an error response. */
const errorBody = ({ code, message, data }: RouteError) =>
	data === undefined ? { code, message } : { code, message, data };

/** Serializes an error as a JSON `{ code, message, data? }` response. */
export function serializeRouteError(error: RouteError): Response {
	const headers = new Headers();
	setHeaders(headers, error.headers as Record<string, unknown>);
	return Response.json(errorBody(error), { status: error.status, headers });
}
