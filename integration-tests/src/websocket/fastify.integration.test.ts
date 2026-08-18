import assert from "node:assert/strict";
import websocket from "@fastify/websocket";
import { registerRoutes } from "@rest-rpc/fastify";
import Fastify from "fastify";
import { createWebSocketImplementations } from "./handlers.ts";
import { runWebSocketSuite } from "./suite.ts";

runWebSocketSuite({
	name: "fastify",
	start: async () => {
		const app = Fastify();
		const seenRoutes: string[] = [];
		await app.register(websocket);

		registerRoutes(app, createWebSocketImplementations("fastify"), {
			preHandler: [
				async (_req, _reply, route) => {
					seenRoutes.push(`${route.method} ${route.path}`);
				},
			],
			webSocket: {
				beforeUpgrade: ({ context }) => {
					assert.ok(context.signal instanceof AbortSignal);
					assert.equal(seenRoutes.at(-1), "GET /ws/:roomId");
				},
			},
		});

		const origin = await app.listen({ host: "127.0.0.1", port: 0 });

		return {
			origin,
			close: () => app.close(),
		};
	},
});
