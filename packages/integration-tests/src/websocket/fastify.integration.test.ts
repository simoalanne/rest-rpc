import websocket from "@fastify/websocket";
import { registerRoutes } from "@rest-rpc/fastify";
import Fastify from "fastify";
import { createWebSocketImplementations } from "./handlers.ts";
import { runWebSocketSuite } from "./suite.ts";

runWebSocketSuite({
	name: "fastify",
	start: async () => {
		const app = Fastify();
		await app.register(websocket);

		registerRoutes(app, createWebSocketImplementations("fastify"), {
			webSocket: {},
		});

		const origin = await app.listen({ host: "127.0.0.1", port: 0 });

		return {
			origin,
			close: () => app.close(),
		};
	},
});
