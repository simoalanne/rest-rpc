import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";

const parseNdjsonValue = async (
	line: string,
	schema: StandardSchemaV1 | undefined,
	validate: boolean,
) => {
	const value = JSON.parse(line);
	if (!validate || !schema) return value;

	const result = await validateStandardSchema(schema, value);
	if (result.issues) throw result.issues;
	return result.value;
};

export async function* parseNdjsonStream(
	schema: StandardSchemaV1 | undefined,
	body: ReadableStream<Uint8Array<ArrayBuffer>>,
	validate: boolean,
): AsyncIterable<unknown> {
	let buffer = "";

	for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";

		for (const line of lines) {
			if (!line.trim()) continue;
			yield parseNdjsonValue(line, schema, validate);
		}
	}

	if (buffer.trim()) {
		yield parseNdjsonValue(buffer, schema, validate);
	}
}
