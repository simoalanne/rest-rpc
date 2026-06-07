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

	it("should throw unknown error when success payload does not match response schema", async () => {
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
					assert.deepStrictEqual(error, {
						code: "unknown",
						message: "Backend returned its response in an unexpected format",
					});
					return true;
				},
			);
		} finally {
			console.warn = previousWarn;
			await server.close();
		}
	});
});
