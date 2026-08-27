import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { createRouteHandler, router } from "@rest-rpc/fetch";
import { createTanstackQueryImplementations } from "./handlers.ts";

export type StartedTanstackQueryServer = {
	origin: string;
	close(): Promise<void>;
};

const listen = (server: Server): Promise<StartedTanstackQueryServer> =>
	new Promise((resolve, reject) => {
		const onError = (error: Error) => {
			server.off("listening", onListening);
			reject(error);
		};

		const onListening = () => {
			server.off("error", onError);
			const address = server.address() as AddressInfo;

			resolve({
				origin: `http://127.0.0.1:${address.port}`,
				close: () =>
					new Promise((closeResolve, closeReject) => {
						server.close((error) =>
							error ? closeReject(error) : closeResolve(),
						);
					}),
			});
		};

		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(0, "127.0.0.1");
	});

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

export const startTanstackQueryServer = async () => {
	const handler = createRouteHandler(
		createTanstackQueryImplementations((contract, handlers) =>
			router(contract).handlers(handlers),
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
			const response = await handler(request, {});

			res.writeHead(response.status, Object.fromEntries(response.headers));
			if (response.body) {
				for await (const chunk of response.body) res.write(chunk);
			}
			res.end();
		}),
	);
};
