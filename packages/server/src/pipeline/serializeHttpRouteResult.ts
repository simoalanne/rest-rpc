import {
	isSerializedBody,
	type BodyCodecRegistry,
	type BodyValue,
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
 * The result's headers override the headers of a `SerializedBody` returned by
 * the codec, except `content-type`, which is always the body's.
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
	return mapMaybePromise(codecs.serialize(value, contentType), (serialized) => {
		if (isSerializedBody(serialized)) {
			const headers: ResponseHeaders = { ...serialized.headers };
			setHeaders(headers, result.headers, result.cookies);
			// Without a codec content type, the runtime sets one, such as for `FormData`.
			const bodyContentType = serialized.headers["content-type"];
			if (bodyContentType === undefined) delete headers["content-type"];
			else headers["content-type"] = bodyContentType;
			return { status, headers, body: serialized.body };
		}
		const headers: ResponseHeaders = {};
		setHeaders(headers, result.headers, result.cookies);
		headers["content-type"] = contentType;
		return { status, headers, body: serialized };
	});
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
