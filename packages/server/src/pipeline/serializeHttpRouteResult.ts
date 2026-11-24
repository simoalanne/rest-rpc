import {
	createBodyCodecRegistry,
	isSerializedBody,
	normalizeMediaType,
	type BodyCodecRegistry,
	type BodyValue,
} from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { HttpRouteResult } from "./handleHttpRoute.ts";
import { mapMaybePromise } from "./maybePromise.ts";
import type { ErrorResponse } from "./asRouteError.ts";

type OutgoingContentType = { readonly "content-type": string };

const SSE = "text/event-stream";

// `text/event-stream` can't be customized with codecs, so a body that isn't a stream
// is sent with the built-in codecs, which never call custom ones.
const defaultCodecs = createBodyCodecRegistry([]);

/** Response headers with lowercase names. `set-cookie` holds every cookie. */
export type ResponseHeaders = Record<string, string | string[]>;

const setHeaders = (
	headers: ResponseHeaders,
	values: Record<string, unknown> | undefined,
	cookies: readonly string[] | undefined,
) => {
	for (const name in values) {
		const value = values[name];
		if (value !== undefined) headers[name.toLowerCase()] = String(value);
	}
	if (cookies?.length) headers["set-cookie"] = [...cookies];
};

/** A serialized route result: the parts a response is written from. */
export type SerializedHttpResponse = {
	status: number;
	headers: ResponseHeaders;
	body: BodyValue | null;
};

/**
 * The headers of a `SerializedBody` returned by the codec, `content-type`
 * included, override the result's headers. Without either, the content type is
 * the selected one. A `FormData` body has none, so the runtime sets the one it
 * generates with the multipart boundary.
 */
export function serializeHttpResponseParts(
	result: HttpRouteResult,
	codecs: BodyCodecRegistry,
): MaybePromise<SerializedHttpResponse> {
	const { status } = result;
	if (!result.body) {
		const headers: ResponseHeaders = {};
		setHeaders(headers, result.headers, result.cookies);
		return { status, headers, body: null };
	}

	// SSE can't be customized with codecs, so it skips them. `cache-control:
	// no-cache` keeps proxies from caching or buffering the stream, unless the
	// handler sets its own.
	if ("events" in result.body) {
		const headers: ResponseHeaders = {};
		setHeaders(headers, result.headers, result.cookies);
		// A declared content type keeps its parameters, such as `charset`.
		if (normalizeMediaType(headers["content-type"] as string) !== SSE) {
			headers["content-type"] = SSE;
		}
		headers["cache-control"] ??= "no-cache";
		return { status, headers, body: result.body.events };
	}

	const { value, contentType } = result.body;
	// The codec sees the result's headers with the selected content type.
	const outgoing: Record<string, string> = {};
	setHeaders(outgoing, result.headers, undefined);
	const declaredContentType = outgoing["content-type"];
	// `FormData` is multipart, whatever the headers say.
	outgoing["content-type"] =
		value instanceof FormData ? "multipart/form-data" : contentType;
	const selected =
		normalizeMediaType(outgoing["content-type"]) === SSE
			? defaultCodecs
			: codecs;
	return mapMaybePromise(
		selected.serialize(
			value,
			outgoing as typeof outgoing & OutgoingContentType,
		),
		(serialized) => {
			const { body, headers: bodyHeaders } = isSerializedBody(serialized)
				? serialized
				: { body: serialized, headers: undefined };
			const headers: ResponseHeaders = bodyHeaders
				? { ...outgoing, ...bodyHeaders }
				: outgoing;
			if (body instanceof FormData) delete headers["content-type"];
			else {
				headers["content-type"] =
					bodyHeaders?.["content-type"] ?? declaredContentType ?? contentType;
			}
			if (result.cookies?.length) headers["set-cookie"] = [...result.cookies];
			return { status, headers, body };
		},
	);
}

/** The JSON body of an error response. */
const errorBody = ({ code, message, data }: ErrorResponse) =>
	data === undefined ? { code, message } : { code, message, data };

/** Serializes an error as the parts of a JSON `{ code, message, data? }` response. */
export function serializeRouteErrorParts(
	error: ErrorResponse,
): SerializedHttpResponse {
	const headers: ResponseHeaders = {};
	setHeaders(headers, error.headers, error.cookies);
	headers["content-type"] = "application/json";
	return {
		status: error.status,
		headers,
		body: JSON.stringify(errorBody(error)),
	};
}
