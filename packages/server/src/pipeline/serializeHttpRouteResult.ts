import type { BodyCodec } from "@rest-rpc/core";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import type { HttpRouteResult } from "./handleHttpRoute.ts";

/** A route result whose response body has been serialized for an adapter to write. */
export type SerializedHttpRouteResult = {
	status: number;
	/** Codec headers overridden by the result's own headers. */
	headers: Record<string, string | number | undefined>;
	/**
	 * Serialized body, absent for bodyless responses. A `null` content type
	 * means no content-type header is sent.
	 */
	body?: { value: unknown; contentType: string | null };
};

// SSE is a special case that should override all codecs and serialize as-is, since the body is already framed and encoded.
const sseCodec = {
	match: (mediaType: string) => mediaType === "text/event-stream",
	serialize: (body: unknown) => ({ body }),
};

/**
 * Serializes a route result body with the first matching body codec and
 * merges the codec's headers with the result headers.
 *
 * @remarks Adapters write the returned status, headers and body to their
 * native response. `bodyCodecs` take precedence over `defaultBodyCodecs`.
 */
export async function serializeHttpRouteResult<Source>(
	result: HttpRouteResult,
	bodyCodecs: readonly BodyCodec<Source>[],
	defaultBodyCodecs: readonly BodyCodec<Source>[],
): Promise<SerializedHttpRouteResult> {
	if (!result.body) {
		return { status: result.status, headers: { ...result.headers } };
	}
	const { value, contentType } = result.body;
	const codec = resolveBodyCodec(normalizeMediaType(contentType), [
		sseCodec,
		...bodyCodecs,
		...defaultBodyCodecs,
	]);
	if (!codec?.serialize) {
		throw new Error("No serializer for declared content-type");
	}
	const serialized = await codec.serialize(value, contentType);
	return {
		status: result.status,
		headers: { ...serialized.headers, ...result.headers },
		body: {
			value: serialized.body,
			contentType:
				serialized.contentType === undefined
					? contentType
					: serialized.contentType,
		},
	};
}
