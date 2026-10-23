import type { BodyValue, SerializedBody } from "./types.ts";

const serializedBodyBrand = Symbol("rest-rpc.serializedBody");

/**
 * Creates a body that is sent with its own headers instead of the selected
 * content type. Without a `content-type` header, the Fetch `Request` or
 * `Response` sets one for the body, such as `multipart/form-data` with its
 * generated boundary for `FormData`.
 *
 * @remarks A `content-type` header may change parameters but must keep the
 * selected base media type, since content types are part of route types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/serialization#serializer-result}
 */
export function serializedBody(
	body: BodyValue,
	headers?: ConstructorParameters<typeof Headers>[0],
): SerializedBody {
	return {
		body,
		headers: new Headers(headers),
		[serializedBodyBrand]: true,
	} as SerializedBody;
}

export const isSerializedBody = (value: unknown): value is SerializedBody =>
	typeof value === "object" && value !== null && serializedBodyBrand in value;
