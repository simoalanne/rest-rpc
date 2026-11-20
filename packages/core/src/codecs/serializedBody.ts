import type { BodyValue, SerializedBody } from "./types.ts";

const serializedBodyBrand = Symbol("rest-rpc.serializedBody");

/**
 * Creates a body that is sent with its own headers. They replace the headers
 * sent with the body, such as those a handler or a call sets, and without a
 * `content-type` header, the selected content type is sent.
 *
 * @remarks A `FormData` body is always sent with the `multipart/form-data`
 * content type the runtime generates with its boundary, so a `content-type`
 * header is ignored for it.
 *
 * A `content-type` header replaces the selected one, and the receiving side
 * decodes the body with the codec of the content type it receives. Route
 * types and OpenAPI documents still show the declared content type.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/encoding#codec-headers}
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
