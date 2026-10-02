import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

export const withHttpServer = async (
	handler: RequestListener,
	run: (url: string) => Promise<void>,
) => {
	const server = createServer(handler);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	try {
		await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
};

// Minimal Fetch host for exercising fetch-native frameworks over a real socket.
export const withFetchServer = (
	handler: (request: Request) => Response | Promise<Response>,
	run: (url: string) => Promise<void>,
) =>
	withHttpServer(async (req, res) => {
		try {
			const chunks: Buffer[] = [];
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
			const headers = new Headers();
			for (const [name, value] of Object.entries(req.headers)) {
				if (value !== undefined)
					headers.set(name, Array.isArray(value) ? value.join(", ") : value);
			}
			const response = await handler(
				new Request(`http://${req.headers.host}${req.url}`, {
					method: req.method,
					headers,
					body: chunks.length ? Buffer.concat(chunks) : undefined,
				}),
			);
			res.writeHead(response.status, Object.fromEntries(response.headers));
			res.end(Buffer.from(await response.arrayBuffer()));
		} catch (error) {
			res.statusCode = 500;
			res.end(String(error));
		}
	}, run);
