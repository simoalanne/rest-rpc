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

/**
 * The header operations serialization uses, implemented by Fetch `Headers`
 * and by the plain header object the Node server writes.
 */
export type HeaderSink = {
	set(name: string, value: string): void;
	append(name: "set-cookie", value: string): void;
	delete(name: string): void;
};

const setHeaders = (
	headers: HeaderSink,
	values: Record<string, unknown> | undefined,
	cookies: readonly string[] | undefined,
) => {
	for (const name in values) {
		const value = values[name];
		if (value !== undefined) headers.set(name, String(value));
	}
	for (const cookie of cookies ?? []) headers.append("set-cookie", cookie);
};

/** A serialized route result: the parts a response is written from. */
export type SerializedHttpResponse<THeaders extends HeaderSink = Headers> = {
	status: number;
	headers: THeaders;
	body: BodyValue | null;
};

const createFetchHeaders = () => new Headers();

/**
 * The result's headers override the headers of a `SerializedBody` returned by
 * the codec, except `content-type`, which is always the body's.
 */
export function serializeHttpResponseParts<THeaders extends HeaderSink>(
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
	createHeaders: () => THeaders,
): MaybePromise<SerializedHttpResponse<THeaders>> {
	const { status } = result;
	if (!result.body) {
		const headers = createHeaders();
		setHeaders(headers, result.headers, result.cookies);
		return { status, headers, body: null };
	}

	const { value, contentType } = result.body;
	return mapMaybePromise(codecs.serialize(value, contentType), (serialized) => {
		const headers = createHeaders();
		if (isSerializedBody(serialized)) {
			serialized.headers.forEach((headerValue, name) =>
				headers.set(name, headerValue),
			);
			setHeaders(headers, result.headers, result.cookies);
			// Without a codec content type, the runtime sets one, such as for `FormData`.
			const bodyContentType = serialized.headers.get("content-type");
			if (bodyContentType === null) headers.delete("content-type");
			else headers.set("content-type", bodyContentType);
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
		serializeHttpResponseParts(result, codecs, createFetchHeaders),
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

/** Serializes an error as the parts of a JSON `{ code, message, data? }` response. */
export function serializeRouteErrorParts<THeaders extends HeaderSink>(
	error: RouteError,
	createHeaders: () => THeaders,
): SerializedHttpResponse<THeaders> {
	const headers = createHeaders();
	setHeaders(headers, error.headers as Record<string, unknown>, error.cookies);
	headers.set("content-type", "application/json");
	return {
		status: error.status,
		headers,
		body: JSON.stringify(errorBody(error)),
	};
}

/** Serializes an error as a JSON `{ code, message, data? }` response. */
export function serializeRouteError(error: RouteError): Response {
	const headers = new Headers();
	setHeaders(headers, error.headers as Record<string, unknown>, error.cookies);
	headers.delete("content-type");
	return Response.json(errorBody(error), { status: error.status, headers });
}
