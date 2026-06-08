import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import z from "zod";
import { ApiClient } from "./apiClient.ts";

const startServer = async (
	handler: (req: {
		method: string;
		url: string;
		headers: Record<string, string | string[] | undefined>;
		bodyText: string;
	}) => { status?: number; body?: unknown },
) => {
	const server = createServer(async (req, res) => {
		let bodyText = "";
		for await (const chunk of req) {
			bodyText += chunk.toString();
		}

		const result = handler({
			method: req.method ?? "",
			url: req.url ?? "",
			headers: req.headers,
			bodyText,
		});

		res.statusCode = result.status ?? 200;
		res.setHeader("content-type", "application/json");
		res.end(JSON.stringify(result.body ?? {}));
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to resolve test server address");
	}

	return {
		baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
		close: async () => {
			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) {
						reject(err);
						return;
					}
					resolve();
				});
			});
		},
	};
};

describe("ApiClient", () => {
	it("should map flat args into params, query and body", async () => {
		const received: {
			method?: string;
			url?: string;
			bodyText?: string;
			headers?: Record<string, string | string[] | undefined>;
		} = {};

		const server = await startServer((req) => {
			received.method = req.method;
			received.url = req.url;
			received.bodyText = req.bodyText;
			received.headers = req.headers;
			return { body: { ok: true } };
		});

		try {
			const contracts = {
				items: {
					update: {
						path: "/items/:id",
						method: "POST",
						request: {
							params: z.object({ id: z.string() }),
							query: z.object({ search: z.string().optional() }),
							body: z.object({ name: z.string() }),
						},
						response: z.object({ ok: z.literal(true) }),
					},
				},
			} as const;

			const client = new ApiClient({
				baseUrl: server.baseUrl,
				contracts,
			});

			assert.equal(client.api.items.update.$contract.path, "/items/:id");
			assert.equal("ctx" in client.api.items.update, false);

			const request = {
				id: "a b",
				search: "carrot",
				name: "Fresh",
			} satisfies Parameters<typeof client.api.items.update.fetch>[0];

			const result = await client.api.items.update.fetch(request);

			assert.deepStrictEqual(result, { ok: true });
			assert.equal(received.method, "POST");
			assert.equal(received.url, "/items/a%20b?search=carrot");
			assert.deepStrictEqual(JSON.parse(received.bodyText ?? "{}"), {
				name: "Fresh",
			});
		} finally {
			await server.close();
		}
	});

	it("should map discriminated union body args into the request body", async () => {
		const received: {
			url?: string;
			bodyText?: string;
		} = {};

		const server = await startServer((req) => {
			received.url = req.url;
			received.bodyText = req.bodyText;
			return { body: { ok: true } };
		});

		try {
			const contracts = {
				items: {
					change: {
						path: "/items/:id",
						method: "POST",
						request: {
							params: z.object({ id: z.string() }),
							query: z.object({ dryRun: z.boolean().optional() }),
							body: z.discriminatedUnion("kind", [
								z.object({
									kind: z.literal("rename"),
									name: z.string(),
								}),
								z.object({
									kind: z.literal("archive"),
									reason: z.string(),
								}),
							]),
						},
						response: z.object({ ok: z.literal(true) }),
					},
				},
			} as const;

			const client = new ApiClient({
				baseUrl: server.baseUrl,
				contracts,
			});

			await client.api.items.change.fetch({
				id: "item-1",
				dryRun: true,
				kind: "rename",
				name: "Fresh",
			});

			assert.equal(received.url, "/items/item-1?dryRun=true");
			assert.deepStrictEqual(JSON.parse(received.bodyText ?? "{}"), {
				kind: "rename",
				name: "Fresh",
			});
		} finally {
			await server.close();
		}
	});

	it("should include default headers on requests", async () => {
		const receivedHeaders: Record<string, string | string[] | undefined> = {};

		const server = await startServer((req) => {
			Object.assign(receivedHeaders, req.headers);
			return { body: { ok: true } };
		});

		try {
			const contracts = {
				secure: {
					path: "/secure",
					method: "GET",
					response: z.object({ ok: z.literal(true) }),
				},
			} as const;

			const client = new ApiClient({
				baseUrl: server.baseUrl,
				contracts,
			});

			client.setHeaders(async () => ({ "x-app": "shared-tests" }));

			await client.api.secure.fetch();

			assert.equal(receivedHeaders["x-app"], "shared-tests");
		} finally {
			await server.close();
		}
	});

	it("should pass through additional fetch init options that are not controlled by the client", async () => {
		const originalFetch = globalThis.fetch;
		let receivedInit: RequestInit | undefined;

		globalThis.fetch = (async (
			_input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			receivedInit = init;
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		try {
			const contracts = {
				status: {
					path: "/status",
					method: "GET",
					response: z.object({ ok: z.literal(true) }),
				},
			} as const;

			const client = new ApiClient({
				baseUrl: "https://example.test",
				contracts,
			});

			await client.api.status.fetch({
				cache: "no-store",
				credentials: "include",
				redirect: "manual",
			});

			assert.equal(receivedInit?.cache, "no-store");
			assert.equal(receivedInit?.credentials, "include");
			assert.equal(receivedInit?.redirect, "manual");
			assert.equal(receivedInit?.method, "GET");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("should parse known HTTP errors and return them from tryFetch", async () => {
		const server = await startServer(() => ({
			status: 409,
			body: {
				code: "TITLE_ALREADY_EXISTS",
				title: "Try the contract-first example",
				status: 409,
			},
		}));

		try {
			const contracts = {
				items: {
					create: {
						path: "/items",
						method: "POST",
						request: {
							body: z.object({ title: z.string() }),
						},
						response: z.object({ id: z.string() }),
						errors: z.object({
							code: z.literal("TITLE_ALREADY_EXISTS"),
							title: z.string(),
							status: z.literal(409),
						}),
					},
				},
			} as const;

			const client = new ApiClient({
				baseUrl: server.baseUrl,
				contracts,
			});

			await assert.rejects(
				() =>
					client.api.items.create.fetch({
						title: "Try the contract-first example",
					}),
				(error: unknown) => {
					assert.deepStrictEqual(error, {
						code: "TITLE_ALREADY_EXISTS",
						status: 409,
						title: "Try the contract-first example",
					});
					return true;
				},
			);

			const result = await client.api.items.create.tryFetch({
				title: "Try the contract-first example",
			});

			assert.equal(result.success, false);
			if (!result.success) {
				assert.equal(result.error.code, "TITLE_ALREADY_EXISTS");
				assert.equal(result.error.status, 409);
				assert.equal(result.error.title, "Try the contract-first example");
			}
		} finally {
			await server.close();
		}
	});

	it("should expose stream for stream contracts and parse ndjson chunks", async () => {
		const server = createServer((req, res) => {
			assert.equal(req.method, "GET");
			assert.equal(req.url, "/events?roomId=room-1");

			res.statusCode = 200;
			res.setHeader("content-type", "application/x-ndjson");
			res.write(`${JSON.stringify({ type: "joined", payload: "Ada" })}\n`);
			res.end(`${JSON.stringify({ type: "left", payload: "Linus" })}\n`);
		});

		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to resolve test server address");
		}

		try {
			const contracts = {
				events: {
					path: "/events",
					method: "GET",
					request: {
						query: z.object({ roomId: z.string() }),
					},
					response: z.object({
						type: z.string(),
						payload: z.string(),
					}),
					options: { mode: "stream" },
				},
			} as const;

			const client = new ApiClient({
				baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
				contracts,
			});

			assert.equal("fetch" in client.api.events, false);
			assert.equal("stream" in client.api.events, true);
			assert.equal(client.api.events.$contract.path, "/events");
			assert.equal("ctx" in client.api.events, false);

			const request = {
				roomId: "room-1",
			} satisfies Parameters<typeof client.api.events.stream>[0];

			const stream = await client.api.events.stream(request);
			const chunks = [];
			for await (const chunk of stream) {
				chunks.push(chunk);
			}

			assert.deepStrictEqual(chunks, [
				{ type: "joined", payload: "Ada" },
				{ type: "left", payload: "Linus" },
			]);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) {
						reject(err);
						return;
					}
					resolve();
				});
			});
		}
	});

	it("should expose subscribe for stream contracts and call callbacks", async () => {
		const server = createServer((req, res) => {
			assert.equal(req.method, "GET");
			assert.equal(req.url, "/events?roomId=room-1");

			res.statusCode = 200;
			res.setHeader("content-type", "application/x-ndjson");
			res.write(`${JSON.stringify({ type: "joined", payload: "Ada" })}\n`);
			res.end(`${JSON.stringify({ type: "left", payload: "Linus" })}\n`);
		});

		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to resolve test server address");
		}

		try {
			const contracts = {
				events: {
					path: "/events",
					method: "GET",
					request: {
						query: z.object({ roomId: z.string() }),
					},
					response: z.object({
						type: z.string(),
						payload: z.string(),
					}),
					options: { mode: "stream" },
				},
			} as const;

			const client = new ApiClient({
				baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
				contracts,
			});

			assert.equal("subscribe" in client.api.events, true);

			const chunks: unknown[] = [];
			await new Promise<void>((resolve, reject) => {
				client.api.events.subscribe(
					{ roomId: "room-1" },
					{
						onData(data) {
							chunks.push(data);
							if (chunks.length === 2) resolve();
						},
						onError: reject,
					},
				);
			});

			assert.deepStrictEqual(chunks, [
				{ type: "joined", payload: "Ada" },
				{ type: "left", payload: "Linus" },
			]);
		} finally {
			await new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) {
						reject(err);
						return;
					}
					resolve();
				});
			});
		}
	});

	it("should expose connect for websocket contracts and validate messages", () => {
		const originalWebSocket = globalThis.WebSocket;
		const instances: MockWebSocket[] = [];

		class MockWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;

			url: string;
			readyState = MockWebSocket.OPEN;
			sent: string[] = [];
			closeArgs?: unknown[];
			private listeners = new Map<string, Set<(event: unknown) => void>>();

			constructor(url: string) {
				this.url = url;
				instances.push(this);
			}

			addEventListener(type: string, listener: (event: unknown) => void) {
				const listeners = this.listeners.get(type) ?? new Set();
				listeners.add(listener);
				this.listeners.set(type, listeners);
			}

			removeEventListener(type: string, listener: (event: unknown) => void) {
				this.listeners.get(type)?.delete(listener);
			}

			send(data: string) {
				this.sent.push(data);
			}

			close(...args: unknown[]) {
				this.readyState = MockWebSocket.CLOSED;
				this.closeArgs = args;
			}

			emit(type: string, event: unknown) {
				this.listeners.get(type)?.forEach((listener) => {
					listener(event);
				});
			}
		}

		globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

		try {
			const contracts = {
				room: {
					path: "/rooms/:roomId/socket",
					method: "GET",
					request: {
						params: z.object({ roomId: z.string() }),
						query: z.object({ token: z.string() }),
					},
					options: { mode: "websocket" },
					messages: {
						client: z.object({
							type: z.literal("ping"),
							id: z.string(),
						}),
						server: z.object({
							type: z.literal("pong"),
							id: z.string(),
						}),
					},
				},
			} as const;

			const client = new ApiClient({
				baseUrl: "http://api.test",
				contracts,
			});

			assert.equal("connect" in client.api.room, true);
			assert.equal("fetch" in client.api.room, false);
			assert.equal("stream" in client.api.room, false);

			const socket = client.api.room.connect({
				roomId: "room 1",
				token: "secret",
			});
			const [rawSocket] = instances;

			assert.equal(
				socket.url,
				"ws://api.test/rooms/room%201/socket?token=secret",
			);
			assert.equal(socket, rawSocket);

			const opened: unknown[] = [];
			const closed: unknown[] = [];
			const results: unknown[] = [];
			socket.onOpen((event) => opened.push(event));
			const unsubscribeClose = socket.onClose((event) => closed.push(event));
			const unsubscribeMessage = socket.onMessage((result) =>
				results.push(result),
			);

			rawSocket.emit("open", { type: "open-event" });
			rawSocket.emit("message", {
				data: JSON.stringify({ type: "pong", id: "message-1" }),
			});
			socket.send({ type: "ping", id: "message-1" });

			assert.deepStrictEqual(opened, [{ type: "open-event" }]);
			assert.deepStrictEqual(results, [
				{ success: true, data: { type: "pong", id: "message-1" } },
			]);
			assert.deepStrictEqual(rawSocket.sent, [
				JSON.stringify({ type: "ping", id: "message-1" }),
			]);

			socket.send({ type: "ping", id: 123 } as unknown as {
				type: "ping";
				id: string;
			});
			assert.deepStrictEqual(rawSocket.sent, [
				JSON.stringify({ type: "ping", id: "message-1" }),
				JSON.stringify({ type: "ping", id: 123 }),
			]);
			rawSocket.emit("message", {
				data: JSON.stringify({ type: "nope" }),
			});
			assert.deepStrictEqual(results, [
				{ success: true, data: { type: "pong", id: "message-1" } },
				{ success: false },
			]);

			assert.throws(() => {
				rawSocket.readyState = MockWebSocket.CLOSED;
				socket.send({ type: "ping", id: "message-2" } as {
					type: "ping";
					id: string;
				});
			});
			rawSocket.readyState = MockWebSocket.OPEN;

			unsubscribeMessage();
			unsubscribeClose();
			rawSocket.emit("message", {
				data: JSON.stringify({ type: "pong", id: "message-2" }),
			});
			rawSocket.emit("close", { code: 1000 });

			assert.deepStrictEqual(results, [
				{ success: true, data: { type: "pong", id: "message-1" } },
				{ success: false },
			]);
			assert.deepStrictEqual(closed, []);

			socket.close(1000, "done");
			assert.deepStrictEqual(rawSocket.closeArgs, [1000, "done"]);
		} finally {
			globalThis.WebSocket = originalWebSocket;
		}
	});

	it("should throw unknown error when success payload does not match response schema", async () => {
		const server = await startServer(() => ({
			body: { ok: false },
		}));

		try {
			const contracts = {
				status: {
					path: "/status",
					method: "GET",
					response: z.object({ ok: z.literal(true) }),
				},
			} as const;

			const client = new ApiClient({
				baseUrl: server.baseUrl,
				contracts,
			});

			await assert.rejects(
				() => client.api.status.fetch(),
				(error: unknown) => {
					assert.deepStrictEqual(error, {
						code: "unknown",
						message: "Backend returned its response in an unexpected format",
					});
					return true;
				},
			);
		} finally {
			await server.close();
		}
	});
});
