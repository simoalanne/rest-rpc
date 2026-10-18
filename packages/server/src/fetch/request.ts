import type { RequestBodySource } from "../pipeline/deserializeRequestBody.ts";

/** Exposes a Fetch request body to codecs as a size-limited Fetch `Request`. */
export const fetchRequestBody = (
	request: Request,
): RequestBodySource<Request> => ({
	contentType: request.headers.get("content-type"),
	contentLength: request.headers.get("content-length"),
	hasBody: request.body !== null,
	open: (maxBytes, onOversized) => {
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
	},
});
