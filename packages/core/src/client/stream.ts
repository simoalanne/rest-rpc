import { HttpError } from "./httpError.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";
import type { SseEvent } from "../sse.ts";

const validateData = async (
	data: unknown,
	schema: StandardSchemaV1 | undefined,
	validate: boolean,
	status: number,
) => {
	if (!validate || !schema) return data;
	const result = await validateStandardSchema(schema, data);
	if (result.issues) {
		throw new HttpError(status, data, { cause: result.issues });
	}
	return result.value;
};

const parseFrame = async (
	frame: string,
	schema: StandardSchemaV1 | undefined,
	validate: boolean,
	status: number,
): Promise<SseEvent<unknown>> => {
	const result: SseEvent<unknown> = { data: undefined };

	for (const line of frame.split("\n")) {
		if (line.startsWith("data: ")) {
			const encodedData = line.slice(6);
			const data = JSON.parse(encodedData);
			result.data = await validateData(data, schema, validate, status);
		}
		if (line.startsWith("id: ")) result.id = line.slice(4);
		if (line.startsWith("event: ")) result.event = line.slice(7);
		if (line.startsWith("retry: ")) result.retry = Number(line.slice(7));
	}

	if (result.data === undefined) {
		throw new Error("SSE frame has no data field.");
	}
	return result;
};

export async function* parseSseStream(
	schema: StandardSchemaV1 | undefined,
	body: ReadableStream<Uint8Array<ArrayBuffer>>,
	validate: boolean,
	status = 200,
): AsyncIterable<SseEvent<unknown>> {
	const decoded = body.pipeThrough(new TextDecoderStream());
	let buffer = "";

	const readFrames = async function* () {
		let boundary = buffer.indexOf("\n\n");
		while (boundary >= 0) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			if (frame) {
				yield await parseFrame(frame, schema, validate, status);
			}
			boundary = buffer.indexOf("\n\n");
		}
	};

	for await (const chunk of decoded) {
		buffer += chunk;
		for await (const event of readFrames()) yield event;
	}
	if (buffer.length > 0) throw new Error("Incomplete SSE frame.");
}
