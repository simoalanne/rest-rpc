import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type { SseEvent, SseFormat } from "../contract/sse.ts";
import {
	contractError,
	contractMismatch,
	validateResponseValue,
} from "./validateResponse.ts";

// Events that cannot be decoded are part of the response, while errors of
// reading the body are transport failures and propagate unchanged.
const decodeError = (cause: unknown) =>
	contractError("Event stream could not be decoded.", cause);

// Empty data is dispatched as "", which isn't JSON.
const deserializeJson = (data: string): unknown =>
	data === "" ? "" : JSON.parse(data);

const decodeEvent = async (
	{ data, ...metadata }: SseEvent<string>,
	schema: StandardSchemaV1 | undefined,
	validate: boolean,
	format: SseFormat | undefined,
): Promise<SseEvent<unknown>> => {
	let value: unknown;
	try {
		value = format ? format.deserialize(data) : deserializeJson(data);
	} catch (error) {
		throw decodeError(error);
	}
	const validated = await validateResponseValue(schema, value, validate);
	if (validated.issues) {
		throw contractError(contractMismatch, validated.issues);
	}
	return { ...metadata, data: validated.value };
};

const lineBreak = /\r\n|\r|\n/;

/**
 * Follows the parsing algorithm of the SSE spec. Events that cannot be decoded
 * or fail validation end the stream with an `Error`.
 *
 * @see {@link https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation}
 */
export async function* parseSseStream(
	schema: StandardSchemaV1 | undefined,
	response: Response & { body: ReadableStream<Uint8Array<ArrayBuffer>> },
	validate: boolean,
	format?: SseFormat,
): AsyncIterable<SseEvent<unknown>> {
	const decoded = response.body.pipeThrough(new TextDecoderStream());
	let buffer = "";
	// The last event ID persists across events, the other fields don't.
	let id = "";
	let data = "";
	let event = "";
	let retry: number | undefined;

	const processLine = (line: string): SseEvent<string> | undefined => {
		if (line === "") {
			const dispatched =
				data === ""
					? undefined
					: {
							data: data.slice(0, -1),
							...(id && { id }),
							...(event && { event }),
							...(retry !== undefined && { retry }),
						};
			data = "";
			event = "";
			retry = undefined;
			return dispatched;
		}
		if (line.startsWith(":")) return undefined;
		const colon = line.indexOf(":");
		const field = colon < 0 ? line : line.slice(0, colon);
		let value = colon < 0 ? "" : line.slice(colon + 1);
		if (value.startsWith(" ")) value = value.slice(1);
		if (field === "data") data += `${value}\n`;
		if (field === "event") event = value;
		if (field === "id" && !value.includes("\0")) id = value;
		if (field === "retry" && /^\d+$/.test(value)) retry = Number(value);
		return undefined;
	};

	// An incomplete last line or event is dropped.
	for await (const chunk of decoded) {
		buffer += chunk;
		// A trailing CR may be the first half of a CRLF split across chunks.
		const end = buffer.endsWith("\r") ? buffer.length - 1 : buffer.length;
		const lines = buffer.slice(0, end).split(lineBreak);
		buffer = `${lines.pop()}${buffer.slice(end)}`;
		for (const line of lines) {
			const dispatched = processLine(line);
			if (dispatched)
				yield await decodeEvent(dispatched, schema, validate, format);
		}
	}
	// At the end, a held back CR ends its line.
	const dispatched = buffer.endsWith("\r") && processLine(buffer.slice(0, -1));
	if (dispatched) yield await decodeEvent(dispatched, schema, validate, format);
}
