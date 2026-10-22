import type { BodyCodecRegistry } from "@rest-rpc/core/codecs";
import type { RouteError } from "@rest-rpc/core";
import type { MaybePromise } from "@rest-rpc/core/utils";
import { MalformedRequestBody } from "./errors.ts";

type DeserializedRequestBody =
	| { body: unknown; rejection: undefined }
	| { body: undefined; rejection: RouteError };

const noBody: DeserializedRequestBody = {
	body: undefined,
	rejection: undefined,
};

const toDeserialized = (body: unknown): DeserializedRequestBody => ({
	body,
	rejection: undefined,
});

const toInvalidBody = (): DeserializedRequestBody => ({
	body: undefined,
	rejection: new MalformedRequestBody(),
});

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
		return toInvalidBody();
	}
}
