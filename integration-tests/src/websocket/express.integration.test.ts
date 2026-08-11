import { createServer } from "node:http";
import { registerRoutes } from "@rest-rpc/express";
import express from "express";
import { WebSocketServer } from "ws";
import { listen, type StartedServer } from "../http/harness/listen.ts";
import { createWebSocketImplementations } from "./handlers.ts";
import { runWebSocketSuite } from "./suite.ts";

runWebSocketSuite({
	name: "express",
	start: async (): Promise<StartedServer> => {
		const app = express();
		const server = createServer(app);
		const webSocketServer = new WebSocketServer({ noServer: true });
		const started = await listen(server);

		registerRoutes(app, createWebSocketImplementations("express"), {
			webSocket: {
				server,
				webSocketServer,
			},
		});

		return {
			origin: started.origin,
			close: async () => {
				webSocketServer.close();
				await started.close();
			},
		};
	},
});
