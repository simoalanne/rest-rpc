import {
	isSerializedBody,
	type BodyCodecRegistry,
	type BodyValue,
} from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { HttpRouteResult } from "./handleHttpRoute.ts";
import { mapMaybePromise } from "./maybePromise.ts";
import type { ErrorResponse } from "./resolveRouteError.ts";

type OutgoingContentType = { readonly "content-type": string };

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

	const { value, contentType } = result.body;
	// The codec sees the result's headers with the selected content type.
	const outgoing: Record<string, string> = {};
	setHeaders(outgoing, result.headers, undefined);
	const declaredContentType = outgoing["content-type"];
	// `FormData` is multipart, whatever the headers say.
	outgoing["content-type"] =
		value instanceof FormData ? "multipart/form-data" : contentType;
	return mapMaybePromise(
		codecs.serialize(value, outgoing as typeof outgoing & OutgoingContentType),
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
