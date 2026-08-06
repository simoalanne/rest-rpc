import type { StreamBody } from "../contract/route.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";

export async function* parseNdjsonStream(
	response: StreamBody,
	body: ReadableStream<Uint8Array>,
	validate: boolean,
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
				const value = JSON.parse(line);
				if (!validate) {
					yield value;
					continue;
				}
				const result = validateStandardSchemaSync(response.schema, value);
				if (result.issues) throw result.issues;
				yield result.value;
			}
		}

		buffer += decoder.decode();
		if (buffer.trim()) {
			const value = JSON.parse(buffer);
			if (!validate) {
				yield value;
				return;
			}
			const result = validateStandardSchemaSync(response.schema, value);
			if (result.issues) throw result.issues;
			yield result.value;
		}
	} finally {
		reader.releaseLock();
	}
}
