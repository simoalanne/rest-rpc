import { Readable } from "node:stream";
import type {
	NestHttpPlatform,
	NestHttpReply,
	NestStreamResponseInput,
} from "./httpPlatform.ts";
import { hasFunction } from "./httpPlatform.ts";

type FastifyLikeRequest = {
	raw?: {
		once?(event: string, listener: () => void): unknown;
	};
};

type FastifyRawResponse = {
	once?(event: string, listener: () => void): unknown;
	setHeader?(name: string, value: unknown): void;
	writableFinished?: boolean;
};

type FastifyLikeResponse = {
	code?(statusCode: number): FastifyLikeResponse;
	header?(name: string, value: unknown): FastifyLikeResponse;
	raw?: FastifyRawResponse;
	send(body?: unknown): unknown;
	status?(statusCode: number): FastifyLikeResponse;
};

const isFastifyLikeResponse = (value: unknown): value is FastifyLikeResponse =>
	hasFunction(value, "send") &&
	(hasFunction(value, "header") || hasFunction(value, "code"));

const setStatus = (res: FastifyLikeResponse, statusCode: number) => {
	if (res.code) {
		res.code(statusCode);
		return;
	}
	res.status?.(statusCode);
};

const setHeader = (res: FastifyLikeResponse, name: string, value: unknown) => {
	if (res.header) {
		res.header(name, value);
		return;
	}
	res.raw?.setHeader?.(name, value);
};

const createFastifyRequestSignal = (
	req: FastifyLikeRequest,
	res: FastifyLikeResponse,
) => {
	const controller = new AbortController();
	const abort = () => controller.abort();
	req.raw?.once?.("aborted", abort);
	res.raw?.once?.("close", () => {
		if (!res.raw?.writableFinished) abort();
	});
	return controller.signal;
};

const toNodeStream = ({ body, mode }: NestStreamResponseInput) =>
	Readable.from(
		(async function* () {
			for await (const chunk of body) {
				yield mode === "ndjson" ? `${JSON.stringify(chunk)}\n` : chunk;
			}
		})(),
	);

const createFastifyReply = (res: FastifyLikeResponse): NestHttpReply => ({
	setHeader: (name, value) => setHeader(res, name, value),
	sendEmpty: (status) => {
		setStatus(res, status);
		res.send();
		return undefined;
	},
	sendJson: (status, body) => {
		setStatus(res, status);
		res.send(body);
		return undefined;
	},
	sendCustom: (status, body) => {
		setStatus(res, status);
		res.send(body);
		return undefined;
	},
	sendStream: (input) => {
		setStatus(res, input.status);
		setHeader(res, "content-type", input.contentType);
		return toNodeStream(input);
	},
});

export const createFastifyHttpPlatform = (
	req: unknown,
	res: unknown,
): NestHttpPlatform | undefined => {
	if (!isFastifyLikeResponse(res)) return undefined;

	return {
		signal: createFastifyRequestSignal(req as FastifyLikeRequest, res),
		reply: createFastifyReply(res),
	};
};
