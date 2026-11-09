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
