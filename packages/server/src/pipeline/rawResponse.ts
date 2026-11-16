import { respond, type ResponseEnvelope } from "./respond.ts";
import type {
	ResponseHeaders,
	SerializedHttpResponse,
} from "./serializeHttpRouteResult.ts";

type RawEnvelope = ResponseEnvelope<Response, { status?: number }> & {
	headers?: Record<string, unknown>;
	cookies?: readonly string[];
};

/**
 * Middleware receives a returned `Response` as an envelope of its status,
 * headers and cookies, with the `Response` as the body.
 */
export const toRawEnvelope = (response: Response) => {
	const headers: Record<string, string> = {};
	for (const [name, value] of response.headers) {
		if (name !== "set-cookie") headers[name] = value;
	}
	// `respond()` rejects a `Response` body in user code, not here.
	return respond(response as unknown, {
		status: response.status,
		headers,
		cookies: response.headers.getSetCookie(),
	});
};

/**
 * After middleware, the envelope's status, headers and cookies are sent with
 * the body of its `Response`.
 */
export const fromRawEnvelope = ({
	body,
	status,
	headers,
	cookies,
}: RawEnvelope): Response => {
	const result = new Headers();
	for (const name in headers) {
		const value = headers[name];
		if (value !== undefined) result.set(name, String(value));
	}
	for (const cookie of cookies ?? []) result.append("set-cookie", cookie);
	return new Response(body.body, { status, headers: result });
};

// `set-cookie` values cannot be joined, so they are written as an array.
export const fromFetchResponse = (
	response: Response,
): SerializedHttpResponse => {
	const headers: ResponseHeaders = Object.fromEntries(response.headers);
	const cookies = response.headers.getSetCookie();
	if (cookies.length) headers["set-cookie"] = cookies;
	return { status: response.status, headers, body: response.body };
};
