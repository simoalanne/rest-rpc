import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initClient } from "@rest-rpc/core";
import type { StartedServer } from "../http/harness/listen.ts";
import { websocketContract } from "./contract.ts";

type WebSocketClient = ReturnType<typeof initClient<typeof websocketContract>>;

type WebSocketSuiteAdapter = {
	name: string;
	start(): Promise<StartedServer>;
};

type TestSocket = ReturnType<WebSocketClient["room"]["openConnection"]>;

const closeSocket = (socket: Pick<WebSocket, "close" | "readyState">) => {
	if (
		socket.readyState === WebSocket.CONNECTING ||
		socket.readyState === WebSocket.OPEN
	) {
		socket.close();
	}
};

const withTimeout = <T>(promise: Promise<T>, label: string) =>
	Promise.race([
		promise,
		new Promise<T>((_resolve, reject) =>
			setTimeout(
				() => reject(new Error(`Timed out waiting for ${label}`)),
				1000,
			),
		),
	]);

const waitForOpen = (socket: TestSocket) =>
	withTimeout(
		new Promise<Event>((resolve, reject) => {
			const offOpen = socket.onOpen((event) => {
				offOpen();
				offError();
				resolve(event);
			});
			const offError = socket.onError((event) => {
				offOpen();
				offError();
				reject(new Error(`WebSocket failed to open: ${event.type}`));
			});
		}),
		"websocket open",
	);

const waitForMessage = (socket: TestSocket) =>
	withTimeout(
		new Promise<unknown>((resolve) => {
			const unsubscribe = socket.onMessage((message) => {
				unsubscribe();
				resolve(message);
			});
		}),
		"websocket message",
	);

const waitForClose = (socket: TestSocket) =>
	withTimeout(
		new Promise<CloseEvent>((resolve) => {
			const unsubscribe = socket.onClose((event) => {
				unsubscribe();
				resolve(event);
			});
		}),
		"websocket close",
	);

export const runWebSocketSuite = (adapter: WebSocketSuiteAdapter) => {
	describe(`${adapter.name} websocket integration`, () => {
		let server: StartedServer;
		let client: WebSocketClient;

		before(async () => {
			server = await adapter.start();
			client = initClient(websocketContract, { baseUrl: server.origin });
		});

		after(async () => {
			await server.close();
		});

		it("connects and receives route params and query values", async () => {
			const socket = client.room.openConnection({
				roomId: "room 1/encoded",
				mode: "fast",
			});

			try {
				await waitForOpen(socket);

				assert.deepEqual(await waitForMessage(socket), {
					type: "welcome",
					message: {
						roomId: "room 1/encoded",
						mode: "fast",
						adapter: adapter.name,
					},
				});
			} finally {
				closeSocket(socket);
			}
		});

		it("round trips validated client and server messages", async () => {
			const socket = client.room.openConnection({
				roomId: "echo-room",
				mode: "slow",
			});

			try {
				await waitForOpen(socket);
				await waitForMessage(socket);

				socket.send({
					type: "echo",
					message: { text: "hello over websocket" },
				});

				assert.deepEqual(await waitForMessage(socket), {
					type: "echo",
					message: {
						text: "hello over websocket",
						roomId: "echo-room",
						mode: "slow",
					},
				});
			} finally {
				closeSocket(socket);
			}
		});

		it("closes invalid client messages with a protocol validation close", async () => {
			const socket = client.room.openConnection({
				roomId: "invalid-message-room",
				mode: "fast",
			});

			try {
				await waitForOpen(socket);
				await waitForMessage(socket);

				socket.send({ type: "echo" } as never);
				const close = await waitForClose(socket);

				assert.equal(close.code, 1007);
				assert.equal(close.reason, "Invalid WebSocket message.");
			} finally {
				closeSocket(socket);
			}
		});

		it("closes when message handlers reject", async () => {
			const socket = client.room.openConnection({
				roomId: "handler-failure-room",
				mode: "fast",
			});

			try {
				await waitForOpen(socket);
				await waitForMessage(socket);

				socket.send({ type: "fail", message: undefined });
				const close = await waitForClose(socket);

				assert.equal(close.code, 1011);
				assert.equal(close.reason, "WebSocket message handler failed.");
			} finally {
				closeSocket(socket);
			}
		});
	});
};
