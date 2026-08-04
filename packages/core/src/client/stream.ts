import type { StreamResponse } from "../contract/route.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";

export async function* parseNdjsonStream(
	response: StreamResponse,
	body: ReadableStream<Uint8Array>,
): AsyncIterable<unknown> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (!line.trim()) continue;
				const result = validateStandardSchemaSync(
					response.schema,
					JSON.parse(line),
				);
				if (result.issues) throw result.issues;
				yield result.value;
			}
		}

		buffer += decoder.decode();
		if (buffer.trim()) {
			const result = validateStandardSchemaSync(
				response.schema,
				JSON.parse(buffer),
			);
			if (result.issues) throw result.issues;
			yield result.value;
		}
	} finally {
		reader.releaseLock();
	}
}
