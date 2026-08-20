import { createServer } from "node:http";
import { Readable } from "node:stream";
import { isCustomBody, isNoBody } from "@rest-rpc/core/contract";
import { createRouteHandler, type WebRouteParseBody } from "@rest-rpc/web";
import { listen } from "../harness/listen.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

const parseBody: WebRouteParseBody = async ({ body, request }) => {
	if (!body || isNoBody(body)) return undefined;
	const contentType = request.headers.get("content-type") ?? "";
	if (!isCustomBody(body)) {
		return contentType.startsWith("application/json")
			? request.json()
			: undefined;
	}
	const declaredContentType = (
		Array.isArray(body.contentType) ? body.contentType : [body.contentType]
	).find((value) => contentType.startsWith(value.split(";")[0] ?? ""));
	if (!declaredContentType) return undefined;
	if (declaredContentType === "application/octet-stream") {
		return new Uint8Array(await request.arrayBuffer());
	}
	if (declaredContentType.startsWith("application/json")) return request.json();
	return request.text();
};

runBodyParsingSuite({
	name: "web",
	start: async () => {
		const handler = createRouteHandler(createBodyParsingImplementations(), {
			parseBody,
		});

		return listen(
			createServer(async (req, res) => {
				const request = new Request(`http://127.0.0.1${req.url}`, {
					method: req.method,
					headers: req.headers as HeadersInit,
					body: withoutBody(req.method) ? undefined : Readable.toWeb(req),
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
	},
});
