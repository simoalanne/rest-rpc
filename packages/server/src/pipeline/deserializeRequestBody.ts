import {
	normalizeMediaType,
	type BodyCodecRegistry,
} from "@rest-rpc/core/codecs";

type DeserializedRequestBody =
	| { body: unknown; rejection: undefined }
	| { body: undefined; rejection: { status: 400; message: string } };

/** Deserializes a request body with the codec for its media type. */
export async function deserializeRequestBody(
	request: Request,
	codecs: BodyCodecRegistry,
): Promise<DeserializedRequestBody> {
	const mediaType = normalizeMediaType(request.headers.get("content-type"));
	if (!mediaType || request.body === null)
		return { body: undefined, rejection: undefined };

	try {
		return {
			body: await codecs.deserialize(request, mediaType),
			rejection: undefined,
		};
	} catch {
		return {
			body: undefined,
			rejection: { status: 400, message: "Invalid request body" },
		};
	}
}
