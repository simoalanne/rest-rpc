import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequestSignal, writeStreamResponse } from "@rest-rpc/node";
import type {
	NestHttpPlatform,
	NestHttpReply,
	NestStreamResponseInput,
} from "./httpPlatform.ts";
import { hasFunction } from "./httpPlatform.ts";

type ExpressLikeResponse = ServerResponse & {
	send(body?: unknown): unknown;
	status(code: number): ExpressLikeResponse;
};

const isExpressLikeResponse = (value: unknown): value is ExpressLikeResponse =>
	hasFunction(value, "status") &&
	hasFunction(value, "send") &&
	hasFunction(value, "setHeader");

const writeExpressStreamResponse = (
	res: ExpressLikeResponse,
	{ body, status, contentType, mode }: NestStreamResponseInput,
) => writeStreamResponse(body, res, status, contentType, mode);

const createExpressReply = (res: ExpressLikeResponse): NestHttpReply => ({
	setHeader: (name, value) =>
		res.setHeader(name, value as string | number | readonly string[]),
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
		signal: createRequestSignal(req as IncomingMessage, res),
		reply: createExpressReply(res),
	};
};
