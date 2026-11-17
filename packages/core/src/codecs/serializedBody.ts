import type { BodyValue, SerializedBody } from "./types.ts";

const serializedBodyBrand = Symbol("rest-rpc.serializedBody");

/**
 * Creates a body that is sent with its own headers. Without a `content-type`
 * header, the selected content type is sent.
 *
 * @remarks A `FormData` body is always sent with the `multipart/form-data`
 * content type the runtime generates with its boundary, so a `content-type`
 * header is ignored for it.
 *
 * A `content-type` header may change parameters but must keep the selected
 * base media type, since content types are part of route types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#custom-codecs}
 */
export function serializedBody(
	body: BodyValue,
	options: { headers?: Record<string, string> } = {},
): SerializedBody {
	const headers: Record<string, string> = {};
	for (const name in options.headers) {
		headers[name.toLowerCase()] = options.headers[name]!;
	}
	return { body, headers, [serializedBodyBrand]: true } as SerializedBody;
}

export const isSerializedBody = (value: unknown): value is SerializedBody =>
	typeof value === "object" && value !== null && serializedBodyBrand in value;
