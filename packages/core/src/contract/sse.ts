import type { StandardSchemaV1 } from "../standard-schema/index.ts";

/** A Server-Sent Event returned by streaming clients. */
export type SseEvent<T> = {
	data: T;
	id?: string;
	event?: string;
	retry?: number;
};

/**
 * Defines a `text/event-stream` response whose schema validates the data of
 * each event.
 *
 * @remarks The same as `{ "text/event-stream": schema }`, so it can be spread
 * next to other media types of the same response.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/streaming}
 */
export function sse<const TSchema extends StandardSchemaV1>(
	schema: TSchema,
): { readonly "text/event-stream": TSchema } {
	return { "text/event-stream": schema };
}

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
