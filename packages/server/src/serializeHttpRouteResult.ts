import type { BodyCodec } from "@rest-rpc/core";
import { normalizeMediaType, resolveBodyCodec } from "@rest-rpc/core/codecs";
import type { HttpHeaders } from "./headers.ts";
import type { HttpRouteResult } from "./httpRouteResult.ts";

/** A route result whose response body has been serialized for an adapter to write. */
export type SerializedHttpRouteResult =
	| {
			kind: "response";
			status: number;
			/** Codec headers overridden by the result's own headers. */
			headers: HttpHeaders;
			/**
			 * Serialized body, absent for bodyless responses. A `null` content type
			 * means no content-type header is sent.
			 */
			body?: { value: unknown; contentType: string | null };
	  }
	| {
			kind: "stream";
			status: number;
			headers: HttpHeaders;
			body: AsyncIterable<string>;
	  };

/**
 * Serializes a route result body with the first matching body codec and
 * merges the codec's headers with the result headers.
 *
 * @remarks Adapters write the returned status, headers and body to their
 * native response. `bodyCodecs` take precedence over `defaultBodyCodecs`.
 */
export async function serializeHttpRouteResult(
	result: HttpRouteResult,
	bodyCodecs: readonly BodyCodec[],
	defaultBodyCodecs: readonly BodyCodec[],
): Promise<SerializedHttpRouteResult> {
	if (result.kind === "stream" || !result.body) {
		return { ...result, headers: { ...result.headers } };
	}
	const { value, contentType } = result.body;
	const codec = resolveBodyCodec(normalizeMediaType(contentType), [
		...bodyCodecs,
		...defaultBodyCodecs,
	]);
	if (!codec?.serialize) {
		throw new Error("No serializer for declared content-type");
	}
	const serialized = await codec.serialize(value, contentType);
	return {
		kind: "response",
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
