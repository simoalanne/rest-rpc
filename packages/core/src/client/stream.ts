import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";

export async function* parseNdjsonStream(
	schema: StandardSchemaV1,
	body: ReadableStream<Uint8Array>,
	validate: boolean,
): AsyncIterable<unknown> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let completed = false;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				completed = true;
				break;
			}

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
				const result = await validateStandardSchema(schema, value);
				if (result.issues) throw result.issues;
				yield result.value;
			}
		}

		buffer += decoder.decode();
		if (buffer.trim()) {
			const value = JSON.parse(buffer);
			if (!validate) {
				yield value;
				completed = true;
				return;
			}
			const result = await validateStandardSchema(schema, value);
			if (result.issues) throw result.issues;
			yield result.value;
		}
	} finally {
		if (!completed) {
			await reader.cancel().catch(() => undefined);
		}
		reader.releaseLock();
	}
}
