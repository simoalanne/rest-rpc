import {
	bodyCodec,
	serializedBody,
	type BodyValue,
	type SseEvent,
	type SseFormat,
} from "@rest-rpc/core";

const sseBrand = Symbol("rest-rpc.sse");

/**
 * Sends already framed SSE bodies as-is, listed before custom codecs so it
 * overrides them. `cache-control: no-cache` keeps proxies from caching or
 * buffering the stream, and a handler's own header replaces it.
 */
export const sseBodyCodec = bodyCodec("text/event-stream", {
	serialize: (body) =>
		serializedBody(body as BodyValue, {
			headers: { "cache-control": "no-cache" },
		}),
});

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

export const isSseServerEvent = (
	value: unknown,
): value is SseServerEvent<unknown> =>
	typeof value === "object" &&
	value !== null &&
	(value as Record<symbol, unknown>)[sseBrand] === true;

/** Converts a stream item into a plain SSE event without the server brand. */
export const toSseEvent = (value: unknown): SseEvent<unknown> => {
	if (!isSseServerEvent(value)) return { data: value };
	const { [sseBrand]: _brand, ...event } = value;
	return event;
};

/**
 * Options of Server-Sent Event responses.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/streaming#stream-options}
 */
export type SseOptions = {
	/** The data format of events, the same as the client's. JSON by default. */
	format?: SseFormat;
	/**
	 * Milliseconds without an event before a `: keepalive` comment is sent, so
	 * proxies don't close an idle connection. Off by default.
	 */
	keepAlive?: number;
	/**
	 * Sends a `: ok` comment right after the headers, so buffering proxies
	 * forward the start of the stream. Off by default.
	 */
	initialComment?: boolean;
};

const lineBreak = /\r\n|\r|\n/;

const formatSseEvent = (
	value: unknown,
	serialize: (data: unknown) => string,
) => {
	const event = toSseEvent(value);
	return [
		event.id === undefined ? undefined : `id: ${event.id}`,
		event.event === undefined ? undefined : `event: ${event.event}`,
		event.retry === undefined ? undefined : `retry: ${event.retry}`,
		// Data that spans lines is sent as one `data` field per line.
		...serialize(event.data)
			.split(lineBreak)
			.map((line) => `data: ${line}`),
		"",
		"",
	]
		.filter((line) => line !== undefined)
		.join("\n");
};

async function* withKeepAlive(
	events: AsyncIterable<string>,
	interval: number,
): AsyncIterable<string> {
	const iterator = events[Symbol.asyncIterator]();
	try {
		let next = iterator.next();
		// A disconnected client cancels the body, which ends this loop.
		while (true) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			const idle = new Promise<undefined>((resolve) => {
				timer = setTimeout(() => resolve(undefined), interval);
			});
			let result: IteratorResult<string> | undefined;
			try {
				result = await Promise.race([next, idle]);
			} finally {
				clearTimeout(timer);
			}
			if (!result) {
				yield ": keepalive\n\n";
				continue;
			}
			if (result.done) return;
			yield result.value;
			next = iterator.next();
		}
	} finally {
		await iterator.return?.();
	}
}

async function* frameEvents(
	body: AsyncIterable<unknown>,
	serialize: (data: unknown) => string,
	initialComment: boolean | undefined,
): AsyncIterable<string> {
	if (initialComment) yield ": ok\n\n";
	for await (const value of body) yield formatSseEvent(value, serialize);
}

export const frameSseStream = (
	body: AsyncIterable<unknown>,
	{ format, keepAlive, initialComment }: SseOptions = {},
): AsyncIterable<string> => {
	const events = frameEvents(
		body,
		format ? format.serialize : serializeData,
		initialComment,
	);
	return keepAlive === undefined ? events : withKeepAlive(events, keepAlive);
};

/** Frames stream items as an SSE response body that body codecs pass through. */
export const sseBody = (body: AsyncIterable<unknown>, options: SseOptions) => ({
	value: frameSseStream(body, options),
	contentType: "text/event-stream",
});

/** Wraps stream data with Server-Sent Event metadata. */
export function sseEvent<T>(
	data: T,
	options: Omit<SseEvent<T>, "data"> = {},
): SseServerEvent<T> {
	const event = { ...options, data };
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
	return { ...event, [sseBrand]: true };
}
