import {
	defaultBodyCodecs,
	normalizeMediaType,
	resolveBodyCodec,
	type BodyCodec,
} from "@rest-rpc/core/codecs";

type DeserializedRequestBody =
	| { body: unknown; rejection: undefined }
	| { body: undefined; rejection: { status: 400 | 413; message: string } };

export async function deserializeRequestBody<TRequest>(
	request: TRequest,
	rawRequestSource:
		| Request
		| { toFetchRequest: () => Request; contentType: string | null | undefined },
	bodyCodecs: readonly BodyCodec<TRequest>[] = [],
	maxBytes?: number,
): Promise<DeserializedRequestBody> {
	const effectiveMaxBytes = maxBytes ?? 1_048_576;
	const isLazyRequest = "toFetchRequest" in rawRequestSource;
	const mediaType = normalizeMediaType(
		isLazyRequest
			? rawRequestSource.contentType
			: rawRequestSource.headers.get("content-type"),
	);
	if (!mediaType || (!isLazyRequest && rawRequestSource.body === null)) {
		return { body: undefined, rejection: undefined };
	}

	const resolvedUserCodec = resolveBodyCodec(mediaType, bodyCodecs);
	if (resolvedUserCodec?.deserialize) {
		return {
			body: await resolvedUserCodec.deserialize(request),
			rejection: undefined,
		};
	}

	const resolvedDefaultCodec = resolveBodyCodec(mediaType, defaultBodyCodecs);
	if (!resolvedDefaultCodec?.deserialize)
		return { body: undefined, rejection: undefined };

	const rawRequest = isLazyRequest
		? rawRequestSource.toFetchRequest()
		: rawRequestSource;
	if (rawRequest.body === null)
		return { body: undefined, rejection: undefined };

	if (Number(rawRequest.headers.get("content-length")) > effectiveMaxBytes) {
		return {
			body: undefined,
			rejection: { status: 413, message: "Request body too large" },
		};
	}

	let oversized = false;
	try {
		const reader = rawRequest.body.getReader();
		let bytes = 0;
		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				const chunk = await reader.read();
				if (chunk.done) {
					controller.close();
					return;
				}
				bytes += chunk.value.byteLength;
				if (bytes > effectiveMaxBytes) {
					oversized = true;
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
		const boundedRequest = new Request(rawRequest, {
			body,
			duplex: "half",
		} as RequestInit & { duplex: "half" });
		return {
			body: await resolvedDefaultCodec.deserialize(boundedRequest),
			rejection: undefined,
		};
	} catch {
		return {
			body: undefined,
			rejection: oversized
				? { status: 413, message: "Request body too large" }
				: { status: 400, message: "Invalid request body" },
		};
	}
}
