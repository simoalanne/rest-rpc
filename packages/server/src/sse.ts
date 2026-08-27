import type { ResponseBodySchema } from "@rest-rpc/core/contract";
import { validateResponseStreamChunk } from "./validation.ts";

export const sseEventMarker: unique symbol = Symbol("rest-rpc.sseEvent");

/**
 * A typed server-sent event yielded by an SSE route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/type-helpers#server-sent-events}
 */
export type SseEvent<T> = {
	readonly [sseEventMarker]: true;
	data: T;
	id?: string;
	retry?: number;
};

type SseEventOptions = {
	id?: string;
	retry?: number;
};

/**
 * Wraps a typed payload as one server-sent event.
 *
 * @see {@link https://rest-rpc.dev/docs/http-responses#server-sent-event-responses}
 */
export function sseEvent<T>(
	data: T,
	options: SseEventOptions = {},
): SseEvent<T> {
	return {
		[sseEventMarker]: true,
		data,
		...options,
	};
}

const isSseEvent = (value: unknown): value is SseEvent<unknown> => {
	return (
		typeof value === "object" &&
		value !== null &&
		sseEventMarker in value &&
		value[sseEventMarker] === true
	);
};

export async function* validateSseEvents(
	body: AsyncIterable<unknown>,
	schema: ResponseBodySchema | undefined,
): AsyncIterable<SseEvent<unknown>> {
	for await (const event of body) {
		if (!isSseEvent(event)) {
			throw new Error("SSE stream chunks must be created with sseEvent().");
		}

		yield sseEvent(await validateResponseStreamChunk(schema, event.data), {
			id: event.id,
			retry: event.retry,
		});
	}
}

/**
 * Formats one typed event as an SSE frame.
 */
export function formatSseEvent(event: SseEvent<unknown>): string {
	const lines: string[] = [];
	if (event.id !== undefined) {
		if (event.id.includes("\0") || /[\r\n]/.test(event.id)) {
			throw new Error("SSE event id must not contain U+0000, CR, or LF.");
		}
		lines.push(`id: ${event.id}`);
	}
	if (event.retry !== undefined) {
		if (!Number.isSafeInteger(event.retry) || event.retry < 0) {
			throw new Error("SSE event retry must be a non-negative safe integer.");
		}
		lines.push(`retry: ${event.retry}`);
	}

	const data = JSON.stringify(event.data);
	if (data === undefined) {
		throw new Error("SSE event data must be JSON serializable.");
	}

	lines.push(`data: ${data}`);
	lines.push("");
	lines.push("");
	return lines.join("\n");
}
