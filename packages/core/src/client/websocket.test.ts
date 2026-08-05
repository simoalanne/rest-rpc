import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
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

	constructor(url: string) {
		super();
		this.url = url;
		instances.push(this);
	}

	send(data: string) {
		this.sent.push(data);
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

});
