import assert from "node:assert/strict";
import { createServer } from "node:http";
import net from "node:net";
import { after, before, describe, it } from "node:test";
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
				beforeUpgrade: ({ context }) => {
					assert.ok(context.signal instanceof AbortSignal);
				},
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

describe("express websocket malformed upgrade integration", () => {
	let server: StartedServer;
	let webSocketServer: WebSocketServer;

	before(async () => {
		const app = express();
		const httpServer = createServer(app);
		webSocketServer = new WebSocketServer({ noServer: true });
		server = await listen(httpServer);

		registerRoutes(app, createWebSocketImplementations("express"), {
			webSocket: {
				server: httpServer,
				webSocketServer,
			},
		});
	});

	after(async () => {
		webSocketServer.close();
		await server.close();
	});

	it("returns 400 instead of producing an unhandled rejection for malformed path params", async () => {
		const response = await new Promise<string>((resolve, reject) => {
			const url = new URL(server.origin);
			const socket = net.connect(Number(url.port), url.hostname, () => {
				socket.write(
					[
						"GET /ws/%E0%A4%A?mode=fast HTTP/1.1",
						`Host: ${url.host}`,
						"Connection: Upgrade",
						"Upgrade: websocket",
						"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
						"Sec-WebSocket-Version: 13",
						"",
						"",
					].join("\r\n"),
				);
			});

			let data = "";
			socket.setTimeout(1000, () => {
				socket.destroy();
				reject(new Error("Timed out waiting for malformed upgrade response"));
			});
			socket.on("data", (chunk) => {
				data += chunk.toString();
			});
			socket.on("end", () => resolve(data));
			socket.on("close", () => resolve(data));
			socket.on("error", reject);
		});

		assert.match(response, /^HTTP\/1\.1 400 Bad Request/);
		assert.match(response, /content-type: application\/json/i);
	});
});

describe("express websocket upgrade error integration", () => {
	let server: StartedServer;
	let webSocketServer: WebSocketServer;

	before(async () => {
		const app = express();
		const httpServer = createServer(app);
		webSocketServer = new WebSocketServer({ noServer: true });
		server = await listen(httpServer);

		registerRoutes(app, createWebSocketImplementations("express"), {
			webSocket: {
				server: httpServer,
				webSocketServer,
				beforeUpgrade: () => {
					throw new Error("boom");
				},
			},
		});
	});

	after(async () => {
		webSocketServer.close();
		await server.close();
	});

	it("returns 500 instead of producing an unhandled rejection when beforeUpgrade throws", async () => {
		const response = await new Promise<string>((resolve, reject) => {
			const url = new URL(server.origin);
			const socket = net.connect(Number(url.port), url.hostname, () => {
				socket.write(
					[
						"GET /ws/room-1?mode=fast HTTP/1.1",
						`Host: ${url.host}`,
						"Connection: Upgrade",
						"Upgrade: websocket",
						"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
						"Sec-WebSocket-Version: 13",
						"",
						"",
					].join("\r\n"),
				);
			});

			let data = "";
			socket.setTimeout(1000, () => {
				socket.destroy();
				reject(new Error("Timed out waiting for upgrade error response"));
			});
			socket.on("data", (chunk) => {
				data += chunk.toString();
			});
			socket.on("end", () => resolve(data));
			socket.on("close", () => resolve(data));
			socket.on("error", reject);
		});

		assert.match(response, /^HTTP\/1\.1 500 Internal Server Error/);
		assert.match(response, /content-type: application\/json/i);
		assert.match(response, /WebSocket upgrade failed/);
	});
});
