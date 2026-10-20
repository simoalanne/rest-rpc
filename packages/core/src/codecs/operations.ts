import type { BodyCodec, BodyDeserializer, BodySerializer } from "./types.ts";

/** Extracts the lowercase base media type without header parameters. */
export function normalizeMediaType(
	contentType: string | undefined | null,
): string {
	return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** Resolves a matching body codec for a given media type from a list of codecs. */
export function resolveBodyCodec<Source = Request | Response>(
	mediaType: string,
	codecs: readonly BodyCodec<Source>[],
):
	| {
			serialize?: BodySerializer;
			deserialize?: BodyDeserializer<Source>;
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

/** Detects async iterable bodies, such as generators and Node streams. */
export const isAsyncIterable = (
	value: unknown,
): value is AsyncIterable<unknown> =>
	value !== null &&
	(typeof value === "object" || typeof value === "function") &&
	Symbol.asyncIterator in value &&
	typeof value[Symbol.asyncIterator] === "function";
