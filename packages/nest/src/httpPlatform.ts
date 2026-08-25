import type { HttpRouteResultStreamMode } from "@rest-rpc/server";
import { createExpressHttpPlatform } from "./expressPlatform.ts";
import { createFastifyHttpPlatform } from "./fastifyPlatform.ts";

export type NestHttpRequest = {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
};

export type NestStreamResponseInput = {
	body: AsyncIterable<unknown>;
	status: number;
	contentType: string;
	mode: HttpRouteResultStreamMode;
	signal: AbortSignal;
};

export type NestHttpReply = {
	setHeader(name: string, value: unknown): void;
	sendEmpty(status: number): unknown;
	sendJson(status: number, body: unknown): unknown;
	sendCustom(status: number, body: unknown): unknown;
	sendStream(input: NestStreamResponseInput): unknown;
};

export type NestHttpPlatform = {
	signal: AbortSignal;
	reply: NestHttpReply;
};

export const hasFunction = <TName extends string>(
	value: unknown,
	name: TName,
): value is Record<TName, (...args: never[]) => unknown> =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Record<TName, unknown>)[name] === "function";

export const createNestHttpPlatform = (
	req: unknown,
	res: unknown,
): NestHttpPlatform => {
	const platform =
		createExpressHttpPlatform(req, res) ?? createFastifyHttpPlatform(req, res);

	if (!platform) {
		throw new Error(
			"Unsupported Nest HTTP platform. @rest-rpc/nest supports the Nest Express and Fastify adapters.",
		);
	}

	return platform;
};
