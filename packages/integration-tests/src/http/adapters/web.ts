import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createHandler, router } from "@rest-rpc/web";
import { createIntegrationImplementations } from "../fixtures/handlers.ts";
import { listen } from "../fixtures/listen.ts";
import type { IntegrationAdapter } from "./types.ts";

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

export const webAdapter: IntegrationAdapter = {
	name: "web",
	start: async () => {
		const handler = createHandler(
			createIntegrationImplementations((contract, handlers) =>
				router(contract, handlers),
			),
		);

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
				const response = await handler(request, { adapter: "web" });

				res.writeHead(response.status, Object.fromEntries(response.headers));
				if (response.body) {
					for await (const chunk of response.body) res.write(chunk);
				}
				res.end();
			}),
		);
	},
};
