import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { SseEvent } from "../contract/sse.ts";
import {
	contractError,
	contractMismatch,
	validateResponseValue,
} from "./validateResponse.ts";

const decodeFrame = (frame: string): SseEvent<unknown> => {
	const result: SseEvent<unknown> = { data: undefined };

	for (const line of frame.split("\n")) {
		if (line.startsWith("data: ")) result.data = JSON.parse(line.slice(6));
		if (line.startsWith("id: ")) result.id = line.slice(4);
		if (line.startsWith("event: ")) result.event = line.slice(7);
		if (line.startsWith("retry: ")) result.retry = Number(line.slice(7));
	}

	if (result.data === undefined) {
		throw new Error("SSE frame has no data field.");
	}
	return result;
};

// Frames that cannot be decoded are part of the response, while errors of
// reading the body are transport failures and propagate unchanged.
const decodeError = (cause: unknown) =>
	contractError("Event stream could not be decoded.", cause);

const parseFrame = async (
	frame: string,
	schema: StandardSchemaV1 | undefined,
	validate: boolean,
): Promise<SseEvent<unknown>> => {
	let event: SseEvent<unknown>;
	try {
		event = decodeFrame(frame);
	} catch (error) {
		throw decodeError(error);
	}
	const validated = await validateResponseValue(schema, event.data, validate);
	if (validated.issues) {
		throw contractError(contractMismatch, validated.issues);
	}
	return { ...event, data: validated.value };
};

/** Events that cannot be decoded or fail validation end the stream with an `Error`. */
export async function* parseSseStream(
	schema: StandardSchemaV1 | undefined,
	response: Response & { body: ReadableStream<Uint8Array<ArrayBuffer>> },
	validate: boolean,
): AsyncIterable<SseEvent<unknown>> {
	const decoded = response.body.pipeThrough(new TextDecoderStream());
	let buffer = "";

	const readFrames = async function* () {
		let boundary = buffer.indexOf("\n\n");
		while (boundary >= 0) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			if (frame) {
				yield await parseFrame(frame, schema, validate);
			}
			boundary = buffer.indexOf("\n\n");
		}
	};

	for await (const chunk of decoded) {
		buffer += chunk;
		for await (const event of readFrames()) yield event;
	}
	if (buffer.length > 0) {
		throw decodeError(new Error("Incomplete SSE frame."));
	}
}
