import type { BodyCodecRegistry } from "@rest-rpc/core/codecs";
import type { MaybePromise } from "@rest-rpc/core/utils";

type DeserializedRequestBody =
	| { body: unknown; rejection: undefined }
	| { body: undefined; rejection: { status: 400; message: string } };

const noBody: DeserializedRequestBody = {
	body: undefined,
	rejection: undefined,
};

const invalidBody: DeserializedRequestBody = {
	body: undefined,
	rejection: { status: 400, message: "Invalid request body" },
};

const toDeserialized = (body: unknown): DeserializedRequestBody => ({
	body,
	rejection: undefined,
});

const toInvalidBody = () => invalidBody;

/**
 * Deserializes a request body with the codec for its received base media
 * type.
 */
export function deserializeRequestBody(
	request: Request,
	mediaType: string,
	codecs: BodyCodecRegistry,
): MaybePromise<DeserializedRequestBody> {
	// Reading `request.body` would create a stream and slow down decoding, so a
	// request with a content type is always decoded, even when its body is empty.
	if (!mediaType) return noBody;

	try {
		const body = codecs.deserialize(request, mediaType);
		return body instanceof Promise
			? body.then(toDeserialized, toInvalidBody)
			: toDeserialized(body);
	} catch {
		return invalidBody;
	}
}
