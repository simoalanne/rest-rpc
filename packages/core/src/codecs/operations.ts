import type { BodyCodec, BodyDeserializer, BodySerializer } from "./types.ts";

/** Extracts the lowercase base media type without header parameters. */
export function normalizeMediaType(
	contentType: string | undefined | null,
): string {
	return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Resolves a matching body codec for a given media type from a list of codecs. */
export function resolveBodyCodec<TSource>(
	mediaType: string,
	codecs: readonly BodyCodec<TSource>[],
):
	| {
			serialize?: BodySerializer;
			deserialize?: BodyDeserializer<TSource>;
	  }
	| undefined {
	if (!mediaType) return undefined;
	let serialize: BodySerializer | undefined;
	let deserialize: BodyDeserializer<TSource> | undefined;

	for (const codec of codecs) {
		if (
			(!serialize && codec.serialize) ||
			(!deserialize && codec.deserialize)
		) {
			if (!codec.match(mediaType)) continue;
			if (!serialize && codec.serialize) {
				const serializeBody = codec.serialize;
				serialize = async (value, contentType) => {
					const result = await serializeBody(value, contentType);
					for (const name of Object.keys(result.headers ?? {})) {
						if (
							["content-type", "content-length", "transfer-encoding"].includes(
								name.toLowerCase(),
							)
						) {
							throw new Error(`Codec headers must not contain "${name}"`);
						}
					}
					if (
						typeof result.contentType === "string" &&
						normalizeMediaType(result.contentType) !== mediaType
					) {
						throw new Error(
							"Codec content-type must retain the declared base media type",
						);
					}
					return result;
				};
			}
			if (!deserialize && codec.deserialize) deserialize = codec.deserialize;
			if (serialize && deserialize) return { serialize, deserialize };
		}
	}
	return serialize || deserialize ? { serialize, deserialize } : undefined;
}
