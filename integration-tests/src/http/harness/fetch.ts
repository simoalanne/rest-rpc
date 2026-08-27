import type { OutgoingHttpHeaders } from "node:http";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree } from "@rest-rpc/server";
import {
	type CreateFetchHandlerOptions,
	createRouteHandler,
} from "@rest-rpc/fetch";
import { listen } from "./listen.ts";

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

const toNodeResponseHeaders = (headers: Headers): OutgoingHttpHeaders => {
	const responseHeaders: OutgoingHttpHeaders = Object.fromEntries(headers);
	const setCookie = (
		headers as Headers & { getSetCookie?: () => string[] }
	).getSetCookie?.();
	if (setCookie?.length) responseHeaders["set-cookie"] = setCookie;
	return responseHeaders;
};

export type FetchAdapterContext = { adapter: "fetch" };

export type FetchAdapterOptions = {
	context?: FetchAdapterContext;
	createHandlerOptions?: CreateFetchHandlerOptions;
	transformResponse?: (response: Response) => Response | Promise<Response>;
};

export const createFetchAdapter = (
	implementations: ImplementationTree<HttpRouteDeclaration>,
	options: FetchAdapterOptions = {},
) => ({
	name: "fetch",
	start: async () => {
		const handler = createRouteHandler(
			implementations,
			options.createHandlerOptions,
		);
		const context = options.context ?? { adapter: "fetch" };

		return listen(
			createServer(async (req, res) => {
				const controller = new AbortController();
				res.once("close", () => {
					if (!res.writableFinished) controller.abort();
				});
				const request = new Request(`http://127.0.0.1${req.url}`, {
					method: req.method,
					headers: req.headers as HeadersInit,
					signal: controller.signal,
					body: withoutBody(req.method)
						? undefined
						: (Readable.toWeb(req) as ReadableStream),
					duplex: "half",
				} as RequestInit & { duplex: "half" });
				let response: Response;
				try {
					response = await handler(request, context);
					response = (await options.transformResponse?.(response)) ?? response;
				} catch (error) {
					res.destroy(error instanceof Error ? error : undefined);
					return;
				}

				res.writeHead(response.status, toNodeResponseHeaders(response.headers));
				try {
					if (response.body) {
						const iterator = response.body[Symbol.asyncIterator]();
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
						res.on("close", onClose);
						try {
							while (!closed) {
								const { done, value } = await iterator.next();
								if (done || closed) break;
								res.write(value);
							}
							finished = true;
						} finally {
							finished = true;
							res.off("close", onClose);
						}
					}
					res.end();
				} catch (error) {
					res.destroy(error instanceof Error ? error : undefined);
				}
			}),
		);
	},
});
