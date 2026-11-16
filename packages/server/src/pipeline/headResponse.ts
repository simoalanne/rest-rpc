import { isAsyncIterable, type BodyValue } from "@rest-rpc/core/codecs";
import type { SerializedHttpResponse } from "./serializeHttpRouteResult.ts";

/** Ends a stream body without reading it, so a generator that has not started never runs. */
export const cancelBody = async (body: BodyValue | null) => {
	// Cancelling a cloned `Response` body settles only once every clone is
	// cancelled, so it isn't awaited.
	if (body instanceof ReadableStream) body.cancel().catch(() => {});
	else if (isAsyncIterable(body)) await body[Symbol.asyncIterator]().return?.();
};

/**
 * The parts of a response to a `HEAD` request: the `GET` response's status and
 * headers, with its body cancelled unread.
 */
export const toHeadResponse = async (
	parts: SerializedHttpResponse,
): Promise<SerializedHttpResponse> => {
	await cancelBody(parts.body);
	return { ...parts, body: null };
};
