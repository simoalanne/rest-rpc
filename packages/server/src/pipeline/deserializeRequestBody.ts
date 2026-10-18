import {
	normalizeMediaType,
	resolveBodyCodec,
	type BodyCodec,
} from "@rest-rpc/core/codecs";

type DeserializedRequestBody =
	| { body: unknown; rejection: undefined }
	| { body: undefined; rejection: { status: 400 | 413; message: string } };

/** Reads an adapter's native request body for codec deserialization. */
export type RequestBodySource<Source> = {
	contentType: string | null | undefined;
	contentLength: string | null | undefined;
	hasBody: boolean;
	/**
	 * Opens the codec source. Its body must fail once more than `maxBytes` are
	 * read, calling `onOversized` first.
	 */
	open: (maxBytes: number, onOversized: () => void) => Source;
};

export function assertRequestBodyLimit(maxBytes: number | undefined) {
	if (
		maxBytes !== undefined &&
		(!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
	) {
		throw new Error("requestBodyLimit must be a positive safe integer");
	}
}

const tooLarge = {
	body: undefined,
	rejection: { status: 413, message: "Request body too large" },
} as const;

/**
 * Deserializes a request body with the first matching codec while enforcing
 * the body limit. Codecs are resolved in order, so callers list custom codecs
 * before the defaults.
 */
export async function deserializeRequestBody<Source>(
	source: RequestBodySource<Source>,
	bodyCodecs: readonly BodyCodec<Source>[],
	maxBytes = 1_048_576,
): Promise<DeserializedRequestBody> {
	const mediaType = normalizeMediaType(source.contentType);
	if (!mediaType || !source.hasBody)
		return { body: undefined, rejection: undefined };

	const deserialize = resolveBodyCodec(mediaType, bodyCodecs)?.deserialize;
	if (!deserialize) return { body: undefined, rejection: undefined };

	if (Number(source.contentLength) > maxBytes) return tooLarge;

	let oversized = false;
	try {
		const body = await deserialize(
			source.open(maxBytes, () => {
				oversized = true;
			}),
		);
		// A codec may swallow the read error and return a partial value.
		if (oversized) return tooLarge;
		return { body, rejection: undefined };
	} catch {
		return oversized
			? tooLarge
			: {
					body: undefined,
					rejection: { status: 400, message: "Invalid request body" },
				};
	}
}
