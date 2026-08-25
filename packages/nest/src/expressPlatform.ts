import type {
	NestHttpPlatform,
	NestHttpReply,
	NestStreamResponseInput,
} from "./httpPlatform.ts";
import { hasFunction } from "./httpPlatform.ts";

type ExpressLikeRequest = {
	once?(event: string, listener: () => void): unknown;
};

type ExpressLikeResponse = {
	destroy?(error?: Error): unknown;
	end(): unknown;
	off?(event: string, listener: () => void): unknown;
	on?(event: string, listener: () => void): unknown;
	once?(event: string, listener: () => void): unknown;
	send(body?: unknown): unknown;
	setHeader(name: string, value: unknown): void;
	status(code: number): ExpressLikeResponse;
	writableFinished?: boolean;
	write?(body: unknown): unknown;
};

const isExpressLikeResponse = (value: unknown): value is ExpressLikeResponse =>
	hasFunction(value, "status") &&
	hasFunction(value, "send") &&
	hasFunction(value, "setHeader");

const createExpressRequestSignal = (
	req: ExpressLikeRequest,
	res: ExpressLikeResponse,
) => {
	const controller = new AbortController();
	const abort = () => controller.abort();
	req.once?.("aborted", abort);
	res.once?.("close", () => {
		if (!res.writableFinished) abort();
	});
	return controller.signal;
};

const writeExpressStreamResponse = async (
	res: ExpressLikeResponse,
	{ body, status, contentType, mode, signal }: NestStreamResponseInput,
) => {
	res.status(status);
	res.setHeader("content-type", contentType);

	const iterator = body[Symbol.asyncIterator]();
	let closed = false;
	let finished = false;
	const closeIterator = async () => {
		try {
			await iterator.return?.();
		} catch {}
	};
	const onClose = () => {
		if (finished) return;
		closed = true;
		void closeIterator();
	};
	res.on?.("close", onClose);
	signal.addEventListener("abort", onClose, { once: true });

	try {
		while (!closed) {
			const { done, value: chunk } = await iterator.next();
			if (done || closed) break;
			res.write?.(mode === "ndjson" ? `${JSON.stringify(chunk)}\n` : chunk);
		}

		finished = true;
		if (!closed) res.end();
	} catch (error) {
		res.destroy?.(error instanceof Error ? error : undefined);
	} finally {
		finished = true;
		signal.removeEventListener("abort", onClose);
		res.off?.("close", onClose);
	}
};

const createExpressReply = (res: ExpressLikeResponse): NestHttpReply => ({
	setHeader: (name, value) => res.setHeader(name, value),
	sendEmpty: (status) => {
		res.status(status);
		return undefined;
	},
	sendJson: (status, body) => {
		res.status(status);
		return body;
	},
	sendCustom: (status, body) => {
		res.status(status);
		res.send(body);
		return undefined;
	},
	sendStream: (input) => writeExpressStreamResponse(res, input),
});

export const createExpressHttpPlatform = (
	req: unknown,
	res: unknown,
): NestHttpPlatform | undefined => {
	if (!isExpressLikeResponse(res)) return undefined;

	return {
		signal: createExpressRequestSignal(req as ExpressLikeRequest, res),
		reply: createExpressReply(res),
	};
};
