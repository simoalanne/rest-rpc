import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { isCustomBody } from "@rest-rpc/core/contract";
import { type HonoParseBody, registerRoutes } from "@rest-rpc/hono";
import { Hono } from "hono";
import { listen } from "../harness/listen.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

const parseBody: HonoParseBody = async ({ body, c }) => {
	const contentType = c.req.header("content-type") ?? "";
	if (!isCustomBody(body)) {
		return contentType.startsWith("application/json")
			? c.req.json()
			: undefined;
	}
	const declaredContentType = (
		Array.isArray(body.contentType) ? body.contentType : [body.contentType]
	).find((value) => contentType.startsWith(value.split(";")[0] ?? ""));
	if (!declaredContentType) return undefined;
	if (declaredContentType === "application/octet-stream") {
		return new Uint8Array(await c.req.arrayBuffer());
	}
	if (declaredContentType.startsWith("application/json")) return c.req.json();
	return c.req.text();
};

runBodyParsingSuite({
	name: "hono",
	start: async () => {
		const app = new Hono();

		registerRoutes(app, createBodyParsingImplementations(), { parseBody });

		const server = createAdaptorServer({
			fetch: app.fetch,
		}) as Server;

		return listen(server);
	},
});
