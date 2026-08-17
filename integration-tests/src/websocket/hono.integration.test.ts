import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { registerRoutes } from "@rest-rpc/hono";
import { Hono } from "hono";
import { listen, type StartedServer } from "../http/harness/listen.ts";
import { createWebSocketImplementations } from "./handlers.ts";
import { runWebSocketSuite } from "./suite.ts";

runWebSocketSuite({
	name: "hono",
	start: async (): Promise<StartedServer> => {
		const app = new Hono();
		const { injectWebSocket, upgradeWebSocket, wss } = createNodeWebSocket({
			app,
		});

		registerRoutes(app, createWebSocketImplementations("hono"), {
			webSocket: {
				upgradeWebSocket,
				beforeUpgrade: ({ context }) => {
					assert.ok(context.signal instanceof AbortSignal);
				},
			},
		});

		const server = createAdaptorServer({
			fetch: app.fetch,
		}) as Server;
		injectWebSocket(server);
		const started = await listen(server);

		return {
			origin: started.origin,
			close: async () => {
				wss.close();
				await started.close();
			},
		};
	},
});
