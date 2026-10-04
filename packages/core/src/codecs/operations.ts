import type { BodyCodec, BodyDeserializer, BodySerializer } from "./types.ts";

/** Extracts the lowercase base media type without header parameters. */
export function normalizeMediaType(
	contentType: string | undefined | null,
): string {
	return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Lists the media types of a single or multi-valued content-type declaration. */
export function contentTypeList(
	contentType: string | readonly string[],
): readonly string[] {
	return typeof contentType === "string" ? [contentType] : contentType;
}

/** Finds the declared content type whose base media type matches a received one. */
export function findDeclaredContentType(
	declared: string | readonly string[] | undefined,
	contentType: string,
): string | undefined {
	if (declared === undefined) return undefined;
	const mediaType = normalizeMediaType(contentType);
	return contentTypeList(declared).find(
		(entry) => normalizeMediaType(entry) === mediaType,
	);
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
	const serializeBody = codecs.find(
		(codec) => codec.serialize && codec.match(mediaType),
	)?.serialize;
	const deserialize = codecs.find(
		(codec) => codec.deserialize && codec.match(mediaType),
	)?.deserialize;
	if (!serializeBody && !deserialize) return undefined;

	const serialize: BodySerializer | undefined = serializeBody
		? async (value, contentType) => {
				const result = await serializeBody(value, contentType);
				if (
					typeof result.contentType === "string" &&
					normalizeMediaType(result.contentType) !== mediaType
				) {
					throw new Error(
						"Codec content-type must retain the declared base media type",
					);
				}
				return result;
			}
		: undefined;
	return { serialize, deserialize };
}
