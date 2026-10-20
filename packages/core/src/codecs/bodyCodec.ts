import type { BodyCodec, BodyCodecOperations } from "./types.ts";

/**
 * Creates a body codec for one media type, a pattern, or a list of both.
 *
 * @example
 * ```ts
 * const msgpack = bodyCodec("application/msgpack", {
 * 	serialize: (value) => encode(value),
 * 	deserialize: async (source) =>
 * 		decode(new Uint8Array(await source.arrayBuffer())),
 * });
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/http-behavior/serialization#custom-codecs}
 */
export function bodyCodec(
	mediaTypes: string | RegExp | readonly (string | RegExp)[],
	operations: BodyCodecOperations,
): BodyCodec {
	return {
		mediaTypes:
			typeof mediaTypes === "string" || mediaTypes instanceof RegExp
				? [mediaTypes]
				: mediaTypes,
		...operations,
	};
}
