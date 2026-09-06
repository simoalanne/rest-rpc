import type { ServerResponse } from "node:http";
import {
	formatSseEvent,
	handleHttpRouteResult,
	type HttpRouteResult,
	type HttpRouteResultStreamMode,
	type SseEvent,
} from "@rest-rpc/server";

/** Pumps a response stream with backpressure and disconnect cancellation. */
export async function writeStreamResponse(
	body: AsyncIterable<unknown>,
	res: ServerResponse,
	status: number,
	contentType = "application/x-ndjson",
	mode: HttpRouteResultStreamMode = "ndjson",
): Promise<void> {
	res.statusCode = status;
	res.setHeader("content-type", contentType);
	const iterator = body[Symbol.asyncIterator]();
	let closed = res.destroyed;
	let done = false;
	let returned = false;
	let resolveClosed: () => void = () => {};
	const disconnected = new Promise<{ done: true; value: undefined }>(
		(resolve) => {
			resolveClosed = () => resolve({ done: true, value: undefined });
		},
	);
	const cancel = () => {
		if (returned || done) return;
		returned = true;
		void Promise.resolve()
			.then(() => iterator.return?.())
			.catch(() => {});
	};
	const onClose = () => {
		closed = true;
		resolveClosed();
		cancel();
	};
	res.once("close", onClose);
	res.once("error", onClose);
	const drain = () =>
		new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				res.off("drain", onDrain);
				res.off("close", onDrain);
				res.off("error", onError);
			};
			const onDrain = () => {
				cleanup();
				resolve();
			};
			const onError = (error: Error) => {
				cleanup();
				reject(error);
			};
			res.once("drain", onDrain);
			res.once("close", onDrain);
			res.once("error", onError);
			if (res.destroyed) onDrain();
		});
	try {
		while (!closed) {
			const next = await Promise.race([iterator.next(), disconnected]);
			if (closed) break;
			if (next.done) {
				done = true;
				break;
			}
			const chunk =
				mode === "ndjson"
					? `${JSON.stringify(next.value)}\n`
					: mode === "sse"
						? formatSseEvent(next.value as SseEvent<unknown>)
						: next.value;
			if (!res.write(chunk as string | Uint8Array) && !closed) await drain();
		}
		if (!closed) res.end();
	} catch (error) {
		cancel();
		if (!res.headersSent) throw error;
		res.destroy(error instanceof Error ? error : undefined);
	} finally {
		res.off("close", onClose);
		res.off("error", onClose);
		if (!done) cancel();
	}
}

/** Writes a normalized HTTP result to a Node ServerResponse. */
export function writeNodeResponse(
	result: HttpRouteResult,
	res: ServerResponse,
): Promise<void> {
	return handleHttpRouteResult(result, {
		setHeader: (name, value) => {
			if (value !== undefined) res.setHeader(name, value);
		},
		sendEmpty: (status) => {
			res.statusCode = status;
			res.end();
		},
		sendJson: (status, body) => {
			const json = JSON.stringify(body);
			res.statusCode = status;
			if (!res.hasHeader("content-type"))
				res.setHeader("content-type", "application/json");
			res.end(json);
		},
		sendCustom: async (status, body) => {
			res.statusCode = status;
			if (body instanceof Blob) body = new Uint8Array(await body.arrayBuffer());
			if (body instanceof ArrayBuffer) body = new Uint8Array(body);
			res.end(body);
		},
		sendStream: ({ status, body, contentType, mode }) =>
			writeStreamResponse(body, res, status, contentType, mode),
	});
}
