import {
	normalizeMediaType,
	resolveBodyCodec,
	type BodyCodec,
} from "@rest-rpc/core/codecs";

type DeserializedRequestBody =
	| { body: unknown; rejection: undefined }
	| { body: undefined; rejection: { status: 400; message: string } };

/**
 * Deserializes a request body with the first matching codec. Codecs are
 * resolved in order, so callers list custom codecs before the defaults.
 */
export async function deserializeRequestBody(
	request: Request,
	bodyCodecs: readonly BodyCodec[],
): Promise<DeserializedRequestBody> {
	const mediaType = normalizeMediaType(request.headers.get("content-type"));
	if (!mediaType || request.body === null)
		return { body: undefined, rejection: undefined };

	const deserialize = resolveBodyCodec(mediaType, bodyCodecs)?.deserialize;
	if (!deserialize) return { body: undefined, rejection: undefined };

	try {
		return { body: await deserialize(request), rejection: undefined };
	} catch {
		return {
			body: undefined,
			rejection: { status: 400, message: "Invalid request body" },
		};
	}
}
