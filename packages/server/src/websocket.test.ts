import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setImmediate } from "node:timers/promises";
import { route as coreRoute } from "@rest-rpc/core";
import {
	type WebSocketMessageSchemas,
	type WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import type { StandardSchemaV1 } from "@rest-rpc/core/standard-schema";
import z from "zod";
import {
	createContractWebSocket,
	handleWebSocketRoute,
	prepareWebSocketUpgrade,
	type WebSocketLike,
} from "./websocket.ts";

class FakeWebSocketLike implements WebSocketLike {
	sent: string[] = [];
	closeCode?: number;
	closeReason?: string;
	private messageCallbacks: Array<(data: unknown) => void> = [];
	private closeCallbacks: Array<
		(event: { code: number; reason: string }) => void
	> = [];

	send(data: string) {
		this.sent.push(data);
	}

	close(code?: number, reason?: string) {
		this.closeCode = code;
		this.closeReason = reason;
	}

	onMessage(callback: (data: unknown) => void) {
		this.messageCallbacks.push(callback);
		return () => {
			this.messageCallbacks = this.messageCallbacks.filter(
				(candidate) => candidate !== callback,
			);
		};
	}

	onClose(callback: (event: { code: number; reason: string }) => void) {
		this.closeCallbacks.push(callback);
		return () => {
			this.closeCallbacks = this.closeCallbacks.filter(
				(candidate) => candidate !== callback,
			);
		};
	}

	receive(data: unknown) {
		for (const callback of this.messageCallbacks) callback(data);
	}
}

type TestMessage = StandardSchemaV1 | WebSocketMessageSchemas;

const normalizeMessage = (message: TestMessage) =>
	"~standard" in message ? { message } : message;

const websocketRoute = (messages: {
	client: TestMessage;
	server: TestMessage;
}) =>
	(() => {
		type MessageBuilder = {
			clientMessage(type: string, schema: StandardSchemaV1): MessageBuilder;
			serverMessage(type: string, schema: StandardSchemaV1): MessageBuilder;
		};

		const builder = coreRoute
			.ws("/rooms/:roomId")
			.params(z.object({ roomId: z.string() })) as unknown as MessageBuilder;

		const addMessages = (
			direction: "client" | "server",
			message: TestMessage,
		) => {
			const normalized = normalizeMessage(message);
			for (const [type, schema] of Object.entries(normalized)) {
				if (direction === "client") builder.clientMessage(type, schema);
				else builder.serverMessage(type, schema);
			}
		};

		addMessages("client", messages.client);
		addMessages("server", messages.server);
		return builder as unknown as WebSocketRouteDeclaration;
	})();

describe("createContractWebSocket", () => {
	it("parses JSON client message strings with transforms", async () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: z.object({
					createdAt: z
						.string()
						.datetime()
						.transform((value) => new Date(value)),
				}),
				server: z.object({ text: z.string() }),
			}),
			rawSocket,
		);
		const messages: Array<{ createdAt: Date }> = [];
		socket.onMessage((message) => messages.push(message));

		rawSocket.receive(
			JSON.stringify({
				type: "message",
				message: { createdAt: "2026-08-10T00:00:00.000Z" },
			}),
		);
		await Promise.resolve();

		assert.ok(messages[0]?.message.createdAt instanceof Date);
		assert.equal(
			messages[0]?.message.createdAt.toISOString(),
			"2026-08-10T00:00:00.000Z",
		);
	});

	it("rejects Date client messages received as JSON strings", async () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: z.object({
					createdAt: z.date(),
				}),
				server: z.object({ text: z.string() }),
			}),
			rawSocket,
		);
		const messages: unknown[] = [];
		socket.onMessage((message) => messages.push(message));

		rawSocket.receive(
			JSON.stringify({
				type: "message",
				message: { createdAt: new Date("2026-08-10T00:00:00.000Z") },
			}),
		);
		await Promise.resolve();

		assert.deepEqual(messages, []);
		assert.equal(rawSocket.closeCode, 1007);
		assert.equal(rawSocket.closeReason, "Invalid WebSocket message.");
	});

	it("serializes transformed server message output", () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: z.object({ text: z.string() }),
				server: z.object({
					name: z
						.object({
							first: z.string(),
							last: z.string(),
						})
						.transform(({ first, last }) => `${first} ${last}`),
				}),
			}),
			rawSocket,
		);

		socket.send({
			type: "message",
			message: {
				name: {
					first: "Ada",
					last: "Lovelace",
				},
			},
		});

		assert.deepEqual(rawSocket.sent, [
			'{"type":"message","message":{"name":"Ada Lovelace"}}',
		]);
	});

	it("serializes Date server message output as JSON strings", () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: z.object({ text: z.string() }),
				server: z.object({
					createdAt: z
						.string()
						.datetime()
						.transform((value) => new Date(value)),
				}),
			}),
			rawSocket,
		);

		socket.send({
			type: "message",
			message: { createdAt: "2026-08-10T00:00:00.000Z" },
		});

		assert.deepEqual(rawSocket.sent, [
			'{"type":"message","message":{"createdAt":"2026-08-10T00:00:00.000Z"}}',
		]);
	});

	it("parses discriminated client message payloads with transforms", async () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: {
					count: z.object({
						value: z.string().transform((value) => Number(value)),
					}),
				},
				server: z.object({ text: z.string() }),
			}),
			rawSocket,
		);
		const messages: unknown[] = [];
		socket.onMessage((message) => messages.push(message));

		rawSocket.receive(
			JSON.stringify({ type: "count", message: { value: "2" } }),
		);
		await Promise.resolve();

		assert.deepEqual(messages, [{ type: "count", message: { value: 2 } }]);
	});

	it("closes discriminated client messages with unknown discriminator values", async () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: {
					count: z.object({ value: z.number() }),
				},
				server: z.object({ text: z.string() }),
			}),
			rawSocket,
		);
		const messages: unknown[] = [];
		socket.onMessage((message) => messages.push(message));

		rawSocket.receive(
			JSON.stringify({ type: "missing", message: { value: 2 } }),
		);
		await Promise.resolve();

		assert.deepEqual(messages, []);
		assert.equal(rawSocket.closeCode, 1007);
		assert.equal(rawSocket.closeReason, "Invalid WebSocket message.");
	});

	it("validates and serializes discriminated server message payloads", () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: z.object({ text: z.string() }),
				server: {
					count: z.object({
						value: z.string().transform((value) => Number(value)),
					}),
				},
			}),
			rawSocket,
		);

		socket.send({ type: "count", message: { value: "2" } });

		assert.deepEqual(rawSocket.sent, [
			'{"type":"count","message":{"value":2}}',
		]);
	});

	it("stops receiving messages after unsubscribing", async () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: z.object({ text: z.string() }),
				server: z.object({ text: z.string() }),
			}),
			rawSocket,
		);
		const messages: Array<{ text: string }> = [];

		const unsubscribe = socket.onMessage((message) => messages.push(message));
		unsubscribe();
		rawSocket.receive(
			JSON.stringify({ type: "message", message: { text: "hello" } }),
		);
		await Promise.resolve();

		assert.deepEqual(messages, []);
	});

	it("closes when an async message handler rejects", async () => {
		const rawSocket = new FakeWebSocketLike();
		const socket = createContractWebSocket(
			websocketRoute({
				client: z.object({ text: z.string() }),
				server: z.object({ text: z.string() }),
			}),
			rawSocket,
		);

		socket.onMessage(async () => {
			throw new Error("boom");
		});
		rawSocket.receive(
			JSON.stringify({ type: "message", message: { text: "hello" } }),
		);
		await setImmediate();

		assert.equal(rawSocket.closeCode, 1011);
		assert.equal(rawSocket.closeReason, "WebSocket message handler failed.");
	});
});

describe("prepareWebSocketUpgrade", () => {
	it("validates requests before accepting upgrades", async () => {
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});
		const implementation = { route, handler: () => undefined };

		const result = await prepareWebSocketUpgrade({
			implementation,
			request: {
				params: { roomId: "room-1" },
			},
			context: {},
		});

		assert.equal(result.ok, true);
		if (result.ok) {
			assert.deepEqual(result.request, { roomId: "room-1" });
		}
	});

	it("returns validation rejections", async () => {
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});
		const implementation = { route, handler: () => undefined };

		const result = await prepareWebSocketUpgrade({
			implementation,
			request: {},
			context: {},
		});

		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.equal(result.rejection.status, 400);
		}
	});

	it("uses custom request validation error rejections", async () => {
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});
		const implementation = { route, handler: () => undefined };

		const result = await prepareWebSocketUpgrade({
			implementation,
			request: {},
			context: { req: "request" },
			errorHandlers: {
				onRequestValidationError({ context, issues, route }) {
					assert.deepEqual(context, { req: "request" });
					assert.equal(route.path, "/rooms/:roomId");

					return {
						status: 422,
						headers: { "x-error": "validation" },
						body: { issueCount: issues.length },
					};
				},
			},
		});

		assert.deepEqual(result, {
			ok: false,
			rejection: {
				status: 422,
				headers: { "x-error": "validation" },
				body: { issueCount: 1 },
			},
		});
	});

	it("returns beforeUpgrade rejections after validation", async () => {
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});
		const implementation = { route, handler: () => undefined };

		const result = await prepareWebSocketUpgrade({
			implementation,
			request: {
				params: { roomId: "room-1" },
			},
			context: { req: "request" },
			beforeUpgrade: ({ request, context }) => {
				assert.deepEqual(request, { roomId: "room-1" });
				assert.deepEqual(context, { req: "request" });

				return {
					status: 403,
					headers: { "x-denied": "true" },
					body: { message: "Denied" },
				};
			},
		});

		assert.deepEqual(result, {
			ok: false,
			rejection: {
				status: 403,
				headers: { "x-denied": "true" },
				body: { message: "Denied" },
			},
		});
	});

	it("returns default unhandled error rejections when beforeUpgrade throws", async () => {
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});
		const implementation = { route, handler: () => undefined };

		const result = await prepareWebSocketUpgrade({
			implementation,
			request: {
				params: { roomId: "room-1" },
			},
			context: {},
			beforeUpgrade: () => {
				throw new Error("boom");
			},
		});

		assert.deepEqual(result, {
			ok: false,
			rejection: {
				status: 500,
				body: {
					message: "WebSocket upgrade failed.",
				},
			},
		});
	});

	it("uses custom unhandled error rejections when beforeUpgrade throws", async () => {
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});
		const implementation = { route, handler: () => undefined };

		const result = await prepareWebSocketUpgrade({
			implementation,
			request: {
				params: { roomId: "room-1" },
			},
			context: { req: "request" },
			beforeUpgrade: () => {
				throw new Error("boom");
			},
			errorHandlers: {
				onUnhandledError({ context, error, request, route }) {
					assert.deepEqual(context, { req: "request" });
					assert.equal((error as Error).message, "boom");
					assert.deepEqual(request, { roomId: "room-1" });
					assert.equal(route.path, "/rooms/:roomId");

					return {
						status: 503,
						headers: { "x-error": "upgrade" },
						body: { code: "UPGRADE_FAILED" },
					};
				},
			},
		});

		assert.deepEqual(result, {
			ok: false,
			rejection: {
				status: 503,
				headers: { "x-error": "upgrade" },
				body: { code: "UPGRADE_FAILED" },
			},
		});
	});
});

describe("handleWebSocketRoute", () => {
	it("passes validated request context and contract socket to the handler", async () => {
		const rawSocket = new FakeWebSocketLike();
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});

		handleWebSocketRoute(
			route,
			(request) => {
				assert.equal(request.roomId, "room-1");
				assert.equal(request.context.userId, "user-1");
				request.context.socket.send({
					type: "message",
					message: { text: "ready" },
				});
			},
			{
				request: { roomId: "room-1" },
				context: { userId: "user-1" },
				socket: rawSocket,
			},
		);
		await setImmediate();

		assert.deepEqual(rawSocket.sent, [
			'{"type":"message","message":{"text":"ready"}}',
		]);
	});

	it("closes when the websocket handler rejects", async () => {
		const rawSocket = new FakeWebSocketLike();
		const route = websocketRoute({
			client: z.object({ text: z.string() }),
			server: z.object({ text: z.string() }),
		});

		handleWebSocketRoute(
			route,
			async () => {
				throw new Error("boom");
			},
			{
				request: { roomId: "room-1" },
				context: {},
				socket: rawSocket,
			},
		);
		await setImmediate();

		assert.equal(rawSocket.closeCode, 1011);
		assert.equal(rawSocket.closeReason, "WebSocket service failed.");
	});
});
