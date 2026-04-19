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
	it("should map flat args into params, query and body and ignore unknown fields", async () => {
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

			const requestWithIgnoredField = {
				id: "a b",
				search: "carrot",
				name: "Fresh",
				ignored: "value",
			} as unknown as Parameters<typeof client.api.items.update.fetch>[0];

			const result = await client.api.items.update.fetch(
				requestWithIgnoredField,
			);

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
				defaultHeaders: { "x-app": "shared-tests" },
			});

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

	it("should call onHttpError and throw unexpected error for HTTP failures", async () => {
		let onHttpErrorCalled = false;

		const server = await startServer(() => ({
			status: 400,
			body: { message: "Item not found" },
		}));

		try {
			const contracts = {
				items: {
					getById: {
						path: "/items/:id",
						method: "GET",
						request: {
							params: z.object({ id: z.string() }),
						},
						response: z.object({ id: z.string() }),
					},
				},
			} as const;

			const client = new ApiClient({
				baseUrl: server.baseUrl,
				contracts,
				onHttpError: () => {
					onHttpErrorCalled = true;
				},
			});

			await assert.rejects(
				() => client.api.items.getById.fetch({ id: "1" }),
				(error: unknown) => {
					assert.equal(typeof error, "object");
					assert.notEqual(error, null);

					const unexpectedError = error as {
						type?: unknown;
						status?: unknown;
					};

					assert.equal(unexpectedError.type, "unexpected");
					assert.equal(unexpectedError.status, 400);
					return true;
				},
			);

			assert.equal(onHttpErrorCalled, true);
		} finally {
			await server.close();
		}
	});

	it("should throw unexpected error when success payload does not match response schema", async () => {
		const server = await startServer(() => ({
			body: { ok: false },
		}));

		const previousWarn = console.warn;
		console.warn = () => {};

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
					assert.equal(typeof error, "object");
					assert.notEqual(error, null);

					const unexpectedError = error as {
						type?: unknown;
						message?: unknown;
					};

					assert.equal(unexpectedError.type, "unexpected");
					assert.equal(typeof unexpectedError.message, "string");
					return true;
				},
			);
		} finally {
			console.warn = previousWarn;
			await server.close();
		}
	});
});
