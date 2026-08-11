import { createServer } from "node:http";
import { Readable } from "node:stream";
import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import type { ImplementationTree } from "@rest-rpc/server";
import { type CreateWebHandlerOptions, createHandler } from "@rest-rpc/web";
import { listen } from "./listen.ts";

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

export type WebAdapterContext = { adapter: "web" };

export type WebAdapterOptions = {
	context?: WebAdapterContext;
	createHandlerOptions?: CreateWebHandlerOptions<WebAdapterContext>;
};

export const createWebAdapter = (
	implementations: ImplementationTree<HttpRouteDeclaration>,
	options: WebAdapterOptions = {},
) => ({
	name: "web",
	start: async () => {
		const handler = createHandler<WebAdapterContext>(
			implementations,
			options.createHandlerOptions,
		);
		const context = options.context ?? { adapter: "web" };

		return listen(
			createServer(async (req, res) => {
				const request = new Request(`http://127.0.0.1${req.url}`, {
					method: req.method,
					headers: req.headers as HeadersInit,
					body: withoutBody(req.method)
						? undefined
						: (Readable.toWeb(req) as ReadableStream),
					duplex: "half",
				} as RequestInit & { duplex: "half" });
				let response: Response;
				try {
					response = await handler(request, context);
				} catch (error) {
					res.destroy(error instanceof Error ? error : undefined);
					return;
				}

				res.writeHead(response.status, Object.fromEntries(response.headers));
				try {
					if (response.body) {
						for await (const chunk of response.body) res.write(chunk);
					}
					res.end();
				} catch (error) {
					res.destroy(error instanceof Error ? error : undefined);
				}
			}),
		);
	},
});
