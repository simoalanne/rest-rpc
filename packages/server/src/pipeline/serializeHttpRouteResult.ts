import {
	isSerializedBody,
	type BodyCodecRegistry,
	type BodyValue,
	type ErrorFormat,
} from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";
import type { HttpRouteResult } from "./handleHttpRoute.ts";
import { mapMaybePromise } from "./maybePromise.ts";
import type { ErrorResponse } from "./resolveRouteError.ts";

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
 * The result's headers, `content-type` included, override the headers of a
 * `SerializedBody` returned by the codec. Without either, the content type is
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
	// `FormData` is multipart, whatever the headers say.
	const codecType =
		value instanceof FormData ? "multipart/form-data" : contentType;
	return mapMaybePromise(codecs.serialize(value, codecType), (serialized) => {
		const { body, headers: bodyHeaders } = isSerializedBody(serialized)
			? serialized
			: { body: serialized, headers: undefined };
		const headers: ResponseHeaders = { ...bodyHeaders };
		setHeaders(headers, result.headers, result.cookies);
		if (body instanceof FormData) delete headers["content-type"];
		else headers["content-type"] ??= contentType;
		return { status, headers, body };
	});
}

/**
 * Creates the serializer of error responses: the error format returns the
 * body, and the body codec for its content type encodes it. The error's
 * headers, `content-type` included, are sent as with other responses.
 */
export const createErrorSerializer =
	(format: ErrorFormat, codecs: BodyCodecRegistry) =>
	(error: ErrorResponse): MaybePromise<SerializedHttpResponse> =>
		serializeHttpResponseParts(
			{
				status: error.status,
				headers: error.headers,
				cookies: error.cookies,
				body: {
					value: format.serialize({
						code: error.code,
						status: error.status,
						message: error.message,
						data: error.data,
					}),
					contentType: format.contentType,
				},
			},
			codecs,
		);
