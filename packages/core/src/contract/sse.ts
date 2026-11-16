import type { StandardSchemaV1 } from "../standard-schema/index.ts";

/** A Server-Sent Event returned by streaming clients. */
export type SseEvent<T> = {
	data: T;
	id?: string;
	event?: string;
	retry?: number;
};

const sseResponseBrand = Symbol("rest-rpc.sse-response");

/**
 * A Server-Sent Event stream response declared with {@link sse}, whose schema
 * validates the data of each event.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/streaming}
 */
export type SseResponse<TSchema extends StandardSchemaV1 = StandardSchemaV1> = {
	readonly [sseResponseBrand]: TSchema;
};

/**
 * Defines a `text/event-stream` response whose schema validates the data of
 * each event.
 *
 * @remarks Pass it to `.response()` in place of a body schema.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/streaming}
 */
export function sse<const TSchema extends StandardSchemaV1>(
	schema: TSchema,
): SseResponse<TSchema> {
	return { [sseResponseBrand]: schema };
}

export const isSseResponse = (value: unknown): value is SseResponse =>
	typeof value === "object" && value !== null && sseResponseBrand in value;

/** The schema of each event's data in a stream declared with {@link sse}. */
export const sseSchema = (value: SseResponse): StandardSchemaV1 =>
	value[sseResponseBrand];

/**
 * Serializes the data of each Server-Sent Event, and deserializes it on the
 * client.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/streaming#data-format}
 */
export type SseFormat = {
	/** Returns the event data to send. It may span several lines. */
	serialize: (data: unknown) => string;
	/** Reads the data of a received event, with its lines joined by `\n`. */
	deserialize: (data: string) => unknown;
};

/**
 * Defines the data format of Server-Sent Events, instead of JSON.
 *
 * @remarks Pass the same format to the server and the client in their `sse`
 * option. It changes how data is sent, not its types.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/streaming#data-format}
 */
export function sseFormat<T>(format: {
	serialize: (data: T) => string;
	deserialize: (data: string) => T;
}): SseFormat {
	return format as SseFormat;
}
