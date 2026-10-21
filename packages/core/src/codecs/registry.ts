import { defaultBodyCodecs, serializeJson } from "./defaults.ts";
import { normalizeMediaType } from "./operations.ts";
import { isSerializedBody } from "./serializedBody.ts";
import type {
	BodyCodec,
	BodySerializer,
	BodyValue,
	SerializedBody,
} from "./types.ts";

/** Body operations looked up by media type from custom and default codecs. */
export type BodyCodecRegistry = {
	/** Serializes a value with the codec for the base media type of `contentType`. */
	serialize: (
		value: unknown,
		contentType: string,
	) => BodyValue | SerializedBody | Promise<BodyValue | SerializedBody>;
	/** Deserializes a source with the codec for a base media type. */
	deserialize: (source: Request | Response, mediaType: string) => unknown;
	/** Whether `contentType` is serialized by the built-in JSON serializer. */
	serializesJson: (contentType: string) => boolean;
};

// Indexes one operation of every codec that has it. Strings are looked up
// directly; the first codec listing a string owns it.
const indexOperation = <TOperation>(
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

// Content types are part of route types, so a codec may change parameters but
// not the base media type.
const assertBaseMediaType = (
	body: BodyValue | SerializedBody,
	mediaType: string,
) => {
	const contentType = isSerializedBody(body)
		? body.headers.get("content-type")
		: null;
	if (contentType !== null && normalizeMediaType(contentType) !== mediaType) {
		throw new Error(
			"Codec content-type must retain the declared base media type",
		);
	}
	return body;
};

/**
 * Creates a registry from custom codecs, which take precedence over the
 * default codecs. Serializers and deserializers are selected independently.
 */
export function createBodyCodecRegistry(
	codecs: readonly BodyCodec[],
): BodyCodecRegistry {
	const all = [...codecs, ...defaultBodyCodecs];
	const findSerializer = indexOperation(all, (codec) => codec.serialize);
	const findDeserializer = indexOperation(all, (codec) => codec.deserialize);

	// Serialized content types come from application code, so each one is
	// resolved once. The default binary codec matches every media type, so
	// lookups always find an operation.
	const serializers = new Map<
		string,
		{ mediaType: string; serialize: BodySerializer }
	>();
	const resolveSerializer = (contentType: string) => {
		let resolved = serializers.get(contentType);
		if (!resolved) {
			const mediaType = normalizeMediaType(contentType);
			resolved = { mediaType, serialize: findSerializer(mediaType)! };
			serializers.set(contentType, resolved);
		}
		return resolved;
	};

	return {
		serialize: (value, contentType) => {
			const { mediaType, serialize } = resolveSerializer(contentType);
			const result = serialize(value, contentType);
			return result instanceof Promise
				? result.then((resolved) => assertBaseMediaType(resolved, mediaType))
				: assertBaseMediaType(result, mediaType);
		},
		deserialize: (source, mediaType) => findDeserializer(mediaType)!(source),
		serializesJson: (contentType) =>
			resolveSerializer(contentType).serialize === serializeJson,
	};
}
