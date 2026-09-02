import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { route } from "../contract/routeFactory.ts";
import { initClient } from "./index.ts";
import { assertWebSocketRoute, buildWebSocketUrl } from "./websocket.ts";

const OriginalWebSocket = globalThis.WebSocket;

class FakeWebSocket extends EventTarget {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	readonly url: string;
	readyState = FakeWebSocket.CONNECTING;
	sent: string[] = [];
	closeCode?: number;
	closeReason?: string;

	constructor(url: string) {
		super();
		this.url = url;
		instances.push(this);
	}

	send(data: string) {
		this.sent.push(data);
	}

	close(code?: number, reason?: string) {
		this.readyState = FakeWebSocket.CLOSED;
		this.closeCode = code;
		this.closeReason = reason;
	}
}

const instances: FakeWebSocket[] = [];

const apiContract = {
	socket: {
		join: route
			.ws("/rooms/:roomId")
			.params(z.object({ roomId: z.string() }))
			.clientMessage("message", z.object({ text: z.string() }))
			.serverMessage("message", z.object({ text: z.string() })),
	},
};

afterEach(() => {
	globalThis.WebSocket = OriginalWebSocket;
	instances.length = 0;
});

describe("ApiClient websockets", () => {
	it("converts HTTP URLs to WebSocket URLs", () => {
		assert.equal(buildWebSocketUrl("http://api.test"), "ws://api.test");
		assert.equal(buildWebSocketUrl("https://api.test"), "wss://api.test");
	});

	it("rejects opening connections when WebSocket is unavailable", () => {
		globalThis.WebSocket = undefined as unknown as typeof WebSocket;
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		assert.throws(
			() => client.socket.join.openConnection({ roomId: "general" }),
			/WebSocket is not available in this runtime/,
		);
	});

	it("builds websocket URLs from route params", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		client.socket.join.openConnection({ roomId: "room 1" });

		assert.equal(instances[0]?.url, "wss://api.test/rooms/room%201");
	});

	it("returns a wrapper without mutating the native websocket", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		const socket = client.socket.join.openConnection({ roomId: "general" });
		const rawSocket = instances[0];

		assert.notEqual(socket, rawSocket);
		assert.equal(socket.raw, rawSocket);
		assert.equal(Object.hasOwn(rawSocket, "send"), false);
		assert.equal(Object.hasOwn(rawSocket, "onOpen"), false);
		assert.equal(Object.hasOwn(rawSocket, "onClose"), false);
		assert.equal(Object.hasOwn(rawSocket, "onError"), false);
		assert.equal(Object.hasOwn(rawSocket, "onMessage"), false);

		rawSocket.readyState = FakeWebSocket.OPEN;
		assert.equal(socket.readyState, FakeWebSocket.OPEN);

		socket.close(4000, "done");
		assert.equal(rawSocket.closeCode, 4000);
		assert.equal(rawSocket.closeReason, "done");
	});

	it("serializes sent messages when the socket is open", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(apiContract, {
			baseUrl: "http://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		instances[0].readyState = FakeWebSocket.OPEN;

		socket.send({ type: "message", message: { text: "hello" } });

		assert.equal(instances[0]?.url, "ws://api.test/rooms/general");
		assert.deepEqual(instances[0]?.sent, [
			'{"type":"message","message":{"text":"hello"}}',
		]);
	});

	it("rejects sends before the socket is open", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });

		assert.throws(
			() => socket.send({ type: "message", message: { text: "hello" } }),
			/WebSocket is not open/,
		);
	});

	it("delivers valid incoming messages", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: unknown[] = [];
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: '{"type":"message","message":{"text":"hello"}}',
			}),
		);

		assert.deepEqual(messages, [
			{ type: "message", message: { text: "hello" } },
		]);
	});

	it("removes event listeners with unsubscribe callbacks", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		let openCount = 0;
		let errorCount = 0;
		let closeCount = 0;

		const unsubscribeOpen = socket.onOpen(() => {
			openCount += 1;
		});
		const unsubscribeError = socket.onError(() => {
			errorCount += 1;
		});
		const unsubscribeClose = socket.onClose(() => {
			closeCount += 1;
		});
		unsubscribeOpen();
		unsubscribeError();
		unsubscribeClose();

		instances[0].dispatchEvent(new Event("open"));
		instances[0].dispatchEvent(new Event("error"));
		instances[0].dispatchEvent(new CloseEvent("close"));

		assert.deepEqual(
			{ openCount, errorCount, closeCount },
			{
				openCount: 0,
				errorCount: 0,
				closeCount: 0,
			},
		);
	});

	it("delivers transformed server message output when validation is disabled", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const serverMessageSchema = z.object({
			name: z
				.object({
					first: z.string(),
					last: z.string(),
				})
				.transform(({ first, last }) => `${first} ${last}`),
		});
		const apiContract = {
			socket: {
				join: route
					.ws("/rooms/:roomId")
					.params(z.object({ roomId: z.string() }))
					.clientMessage("message", z.object({ text: z.string() }))
					.serverMessage("message", serverMessageSchema),
			},
		};
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: unknown[] = [];
		const serverOutput = serverMessageSchema.parse({
			name: { first: "Ada", last: "Lovelace" },
		});
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "message", message: serverOutput }),
			}),
		);

		assert.deepEqual(messages, [
			{ type: "message", message: { name: "Ada Lovelace" } },
		]);
	});

	it("closes transformed server message output when validation is enabled and output does not match input", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const serverMessageSchema = z.object({
			name: z
				.object({
					first: z.string(),
					last: z.string(),
				})
				.transform(({ first, last }) => `${first} ${last}`),
		});
		const apiContract = {
			socket: {
				join: route
					.ws("/rooms/:roomId")
					.params(z.object({ roomId: z.string() }))
					.clientMessage("message", z.object({ text: z.string() }))
					.serverMessage("message", serverMessageSchema),
			},
		};
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: unknown[] = [];
		const serverOutput = serverMessageSchema.parse({
			name: { first: "Ada", last: "Lovelace" },
		});
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "message", message: serverOutput }),
			}),
		);

		assert.deepEqual(messages, []);
		assert.equal(instances[0].closeCode, 1007);
		assert.equal(instances[0].closeReason, "Invalid WebSocket message.");
	});

	it("delivers serialized Date server message output when validation is disabled", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const serverMessageSchema = z.object({
			createdAt: z
				.string()
				.datetime()
				.transform((value) => new Date(value)),
		});
		const apiContract = {
			socket: {
				join: route
					.ws("/rooms/:roomId")
					.params(z.object({ roomId: z.string() }))
					.clientMessage("message", z.object({ text: z.string() }))
					.serverMessage("message", serverMessageSchema),
			},
		};
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: unknown[] = [];
		const serverOutput = serverMessageSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "message", message: serverOutput }),
			}),
		);

		assert.equal(
			(messages[0] as { message: { createdAt: unknown } }).message.createdAt,
			"2026-08-10T00:00:00.000Z",
		);
	});

	it("parses serialized Date server message output when validation is enabled", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const serverMessageSchema = z.object({
			createdAt: z
				.string()
				.datetime()
				.transform((value) => new Date(value)),
		});
		const apiContract = {
			socket: {
				join: route
					.ws("/rooms/:roomId")
					.params(z.object({ roomId: z.string() }))
					.clientMessage("message", z.object({ text: z.string() }))
					.serverMessage("message", serverMessageSchema),
			},
		};
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: Array<{ type: "message"; message: { createdAt: Date } }> =
			[];
		const serverOutput = serverMessageSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "message", message: serverOutput }),
			}),
		);

		assert.ok(messages[0]?.message.createdAt instanceof Date);
		assert.equal(
			messages[0]?.message.createdAt.toISOString(),
			"2026-08-10T00:00:00.000Z",
		);
	});

	it("validates discriminated incoming server message payloads", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const apiContract = {
			socket: {
				join: route
					.ws("/rooms/:roomId")
					.params(z.object({ roomId: z.string() }))
					.clientMessage("message", z.object({ text: z.string() }))
					.serverMessage(
						"count",
						z.object({
							value: z.string().transform((value) => Number(value)),
						}),
					),
			},
		};
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: unknown[] = [];
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "count", message: { value: "2" } }),
			}),
		);

		assert.deepEqual(messages, [{ type: "count", message: { value: 2 } }]);
	});

	it("closes invalid discriminated incoming server messages", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const apiContract = {
			socket: {
				join: route
					.ws("/rooms/:roomId")
					.params(z.object({ roomId: z.string() }))
					.clientMessage("message", z.object({ text: z.string() }))
					.serverMessage("count", z.object({ value: z.number() })),
			},
		};
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: unknown[] = [];
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({ type: "missing", message: { value: 2 } }),
			}),
		);

		assert.deepEqual(messages, []);
		assert.equal(instances[0].closeCode, 1007);
		assert.equal(instances[0].closeReason, "Invalid WebSocket message.");
	});
});

describe("assertWebSocketRoute", () => {
	it("accepts websocket route declarations", () => {
		assert.doesNotThrow(() => assertWebSocketRoute(apiContract.socket.join));
	});

	it("rejects HTTP route declarations", () => {
		assert.throws(
			() => assertWebSocketRoute(route.get("/todos").response(204)),
			/Expected a websocket route/,
		);
	});
});
