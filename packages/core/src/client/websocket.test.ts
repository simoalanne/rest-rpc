import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { router } from "../contract/define.ts";
import { createClientTestContract } from "./factories.ts";
import { initClient } from "./index.ts";

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

afterEach(() => {
	globalThis.WebSocket = OriginalWebSocket;
	instances.length = 0;
});

describe("ApiClient websockets", () => {
	it("builds websocket URLs from route params", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		client.socket.join.openConnection({ roomId: "room 1" });

		assert.equal(instances[0]?.url, "wss://api.test/rooms/room%201");
	});

	it("serializes sent messages when the socket is open", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(createClientTestContract(), {
			baseUrl: "http://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		instances[0].readyState = FakeWebSocket.OPEN;

		socket.send({ text: "hello" });

		assert.equal(instances[0]?.url, "ws://api.test/rooms/general");
		assert.deepEqual(instances[0]?.sent, ['{"text":"hello"}']);
	});

	it("rejects sends before the socket is open", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });

		assert.throws(
			() => socket.send({ text: "hello" }),
			/WebSocket is not open/,
		);
	});

	it("delivers valid incoming messages", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: unknown[] = [];
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", { data: '{"text":"hello"}' }),
		);

		assert.deepEqual(messages, [{ text: "hello" }]);
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
		const apiContract = router({
			socket: {
				join: {
					method: "GET",
					path: "/rooms/:roomId",
					request: {
						params: z.object({ roomId: z.string() }),
					},
					options: { mode: "websocket" },
					messages: {
						client: z.object({ text: z.string() }),
						server: serverMessageSchema,
					},
				},
			},
		});
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
			new MessageEvent("message", { data: JSON.stringify(serverOutput) }),
		);

		assert.deepEqual(messages, [{ name: "Ada Lovelace" }]);
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
		const apiContract = router({
			socket: {
				join: {
					method: "GET",
					path: "/rooms/:roomId",
					request: {
						params: z.object({ roomId: z.string() }),
					},
					options: { mode: "websocket" },
					messages: {
						client: z.object({ text: z.string() }),
						server: serverMessageSchema,
					},
				},
			},
		});
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
			new MessageEvent("message", { data: JSON.stringify(serverOutput) }),
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
		const apiContract = router({
			socket: {
				join: {
					method: "GET",
					path: "/rooms/:roomId",
					request: {
						params: z.object({ roomId: z.string() }),
					},
					options: { mode: "websocket" },
					messages: {
						client: z.object({ text: z.string() }),
						server: serverMessageSchema,
					},
				},
			},
		});
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: Array<{ createdAt: unknown }> = [];
		const serverOutput = serverMessageSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", { data: JSON.stringify(serverOutput) }),
		);

		assert.equal(messages[0]?.createdAt, "2026-08-10T00:00:00.000Z");
	});

	it("parses serialized Date server message output when validation is enabled", () => {
		globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
		const serverMessageSchema = z.object({
			createdAt: z
				.string()
				.datetime()
				.transform((value) => new Date(value)),
		});
		const apiContract = router({
			socket: {
				join: {
					method: "GET",
					path: "/rooms/:roomId",
					request: {
						params: z.object({ roomId: z.string() }),
					},
					options: { mode: "websocket" },
					messages: {
						client: z.object({ text: z.string() }),
						server: serverMessageSchema,
					},
				},
			},
		});
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});
		const socket = client.socket.join.openConnection({ roomId: "general" });
		const messages: Array<{ createdAt: Date }> = [];
		const serverOutput = serverMessageSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		socket.onMessage((message) => messages.push(message));

		instances[0].dispatchEvent(
			new MessageEvent("message", { data: JSON.stringify(serverOutput) }),
		);

		assert.ok(messages[0]?.createdAt instanceof Date);
		assert.equal(
			messages[0]?.createdAt.toISOString(),
			"2026-08-10T00:00:00.000Z",
		);
	});
});
