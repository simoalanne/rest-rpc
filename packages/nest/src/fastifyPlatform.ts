import type { IncomingMessage, ServerResponse } from "node:http";
import { createNodeResponseStream, createRequestSignal } from "@rest-rpc/node";
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

const toNodeStream = ({ body, mode }: NestStreamResponseInput) =>
	createNodeResponseStream(body, mode);

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
	const rawRequest = (req as FastifyLikeRequest).raw;
	const signal =
		rawRequest && res.raw
			? createRequestSignal(
					rawRequest as IncomingMessage,
					res.raw as ServerResponse,
				)
			: new AbortController().signal;

	return {
		signal,
		reply: createFastifyReply(res),
	};
};
