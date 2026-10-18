import {
	normalizeMediaType,
	resolveBodyCodec,
	type BodyCodec,
} from "@rest-rpc/core/codecs";

type DeserializedRequestBody =
	| { body: unknown; rejection: undefined }
	| { body: undefined; rejection: { status: 400 | 413; message: string } };

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

/** Copies `request` with a body that fails once more than `maxBytes` are read. */
const limitRequestBody = (
	request: Request,
	maxBytes: number,
	onOversized: () => void,
): Request => {
	const reader = request.body!.getReader();
	let bytes = 0;
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const chunk = await reader.read();
			if (chunk.done) {
				controller.close();
				return;
			}
			bytes += chunk.value.byteLength;
			if (bytes > maxBytes) {
				onOversized();
				const error = new Error("Request body too large");
				controller.error(error);
				void reader.cancel(error).catch(() => {});
				return;
			}
			controller.enqueue(chunk.value);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
	return new Request(request, {
		body,
		duplex: "half",
	} as RequestInit & { duplex: "half" });
};

/**
 * Deserializes a request body with the first matching codec while enforcing
 * the body limit. Codecs are resolved in order, so callers list custom codecs
 * before the defaults.
 */
export async function deserializeRequestBody(
	request: Request,
	bodyCodecs: readonly BodyCodec[],
	maxBytes = 1_048_576,
): Promise<DeserializedRequestBody> {
	const mediaType = normalizeMediaType(request.headers.get("content-type"));
	if (!mediaType || request.body === null)
		return { body: undefined, rejection: undefined };

	const deserialize = resolveBodyCodec(mediaType, bodyCodecs)?.deserialize;
	if (!deserialize) return { body: undefined, rejection: undefined };

	if (Number(request.headers.get("content-length")) > maxBytes) return tooLarge;

	let oversized = false;
	try {
		const body = await deserialize(
			limitRequestBody(request, maxBytes, () => {
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
