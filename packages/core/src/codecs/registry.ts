import { defaultBodyCodecs, serializeJson } from "./defaults.ts";
import { normalizeMediaType } from "./operations.ts";
import type { BodyCodec, BodySerializer, IncomingBody } from "./types.ts";

export type BodyCodecRegistry = {
	/** Serializes a value with the codec for the base media type of its `content-type` header. */
	serialize: BodySerializer;
	/**
	 * Deserializes a body with the codec for its base media type, passing the
	 * received headers to the codec.
	 */
	deserialize: (
		body: IncomingBody,
		mediaType: string,
		headers: Readonly<Record<string, string>>,
	) => unknown;
	/** Whether `contentType` is serialized by the built-in JSON serializer. */
	serializesJson: (contentType: string) => boolean;
};

// Indexes one operation of every codec in a group that has it. Strings are
// looked up directly; the first codec listing a string owns it.
const indexGroup = <TOperation>(
	codecs: readonly BodyCodec[],
	operation: (codec: BodyCodec) => TOperation | undefined,
) => {
	const exact = new Map<string, TOperation>();
	const patterns: (readonly [RegExp, TOperation])[] = [];
	for (const codec of codecs) {
		const value = operation(codec);
		if (value === undefined) continue;
		for (const mediaType of codec.mediaTypes) {
			if (typeof mediaType !== "string") patterns.push([mediaType, value]);
			else if (!exact.has(mediaType)) exact.set(mediaType, value);
		}
	}
	return (mediaType: string) =>
		exact.get(mediaType) ??
		patterns.find(([pattern]) => pattern.test(mediaType))?.[1];
};

const findDefaultSerializer = indexGroup(
	defaultBodyCodecs,
	(codec) => codec.serialize,
);
const findDefaultDeserializer = indexGroup(
	defaultBodyCodecs,
	(codec) => codec.deserialize,
);

/**
 * Every custom codec takes precedence over the defaults, a pattern included,
 * and serializers and deserializers are selected independently.
 */
export function createBodyCodecRegistry(
	codecs: readonly BodyCodec[],
): BodyCodecRegistry {
	const findCustomSerializer = indexGroup(codecs, (codec) => codec.serialize);
	const findCustomDeserializer = indexGroup(
		codecs,
		(codec) => codec.deserialize,
	);
	const findSerializer = (mediaType: string) =>
		findCustomSerializer(mediaType) ?? findDefaultSerializer(mediaType);
	const findDeserializer = (mediaType: string) =>
		findCustomDeserializer(mediaType) ?? findDefaultDeserializer(mediaType);

	// Serialized content types come from application code, so each one is
	// resolved once. The default binary codec matches every media type, so
	// lookups always find an operation.
	const serializers = new Map<string, BodySerializer>();
	const resolveSerializer = (contentType: string) => {
		let serialize = serializers.get(contentType);
		if (!serialize) {
			serialize = findSerializer(normalizeMediaType(contentType))!;
			serializers.set(contentType, serialize);
		}
		return serialize;
	};

	return {
		serialize: (value, headers) =>
			resolveSerializer(headers["content-type"])(value, headers),
		deserialize: (body, mediaType, headers) =>
			findDeserializer(mediaType)!(body, headers),
		serializesJson: (contentType) =>
			resolveSerializer(contentType) === serializeJson,
	};
}
