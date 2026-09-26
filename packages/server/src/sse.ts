import type { SseEvent } from "@rest-rpc/core";

const sseBrand = Symbol("rest-rpc.sse");

/** A branded SSE value yielded by server handlers when event metadata is needed. */
export type SseServerEvent<T> = SseEvent<T> & {
	readonly [sseBrand]: true;
};

const serializeData = (data: unknown) => {
	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(data);
	} catch (error) {
		throw new TypeError("SSE event data must be JSON serializable.", {
			cause: error,
		});
	}
	if (serialized === undefined) {
		throw new TypeError("SSE event data must have a JSON representation.");
	}
	return serialized;
};

/** Wraps stream data with optional Server-Sent Event metadata. */
export function sse<T>(event: SseEvent<T>): SseServerEvent<T> {
	if (event.id !== undefined && /[\0\r\n]/u.test(event.id)) {
		throw new TypeError(
			"SSE event id must be a string without NUL, carriage return, or line feed.",
		);
	}
	if (event.event !== undefined && /[\r\n]/u.test(event.event)) {
		throw new TypeError(
			"SSE event name must be a string without carriage return or line feed.",
		);
	}
	if (
		event.retry !== undefined &&
		(!Number.isSafeInteger(event.retry) || event.retry < 0)
	) {
		throw new TypeError(
			"SSE retry must be a non-negative safe integer in milliseconds.",
		);
	}
	serializeData(event.data);
	return { ...event, [sseBrand]: true };
}

export const isSseServerEvent = (
	value: unknown,
): value is SseServerEvent<unknown> =>
	typeof value === "object" &&
	value !== null &&
	(value as Record<symbol, unknown>)[sseBrand] === true;

const formatSseEvent = (value: unknown) => {
	const event: SseEvent<unknown> = isSseServerEvent(value)
		? value
		: { data: value };
	return [
		event.id === undefined ? undefined : `id: ${event.id}`,
		event.event === undefined ? undefined : `event: ${event.event}`,
		event.retry === undefined ? undefined : `retry: ${event.retry}`,
		`data: ${serializeData(event.data)}`,
		"",
		"",
	]
		.filter((line) => line !== undefined)
		.join("\n");
};

export async function* frameSseStream(
	body: AsyncIterable<unknown>,
): AsyncIterable<string> {
	for await (const value of body) yield formatSseEvent(value);
}
