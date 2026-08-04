import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { initClient } from "./client.ts";
import { defineContract } from "./contract/define.ts";
import { customBody, noBody } from "./contract/route.ts";
import type { StandardSchemaV1 } from "./standardSchema.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("ApiClient custom request bodies", () => {
	it("should send custom bodies with their declared content type", async () => {
		const apiContract = defineContract({
			uploads: {
				create: {
					method: "POST",
					path: "/uploads/:id",
					request: {
						params: z.object({ id: z.string() }),
						body: customBody({
							schema: z.string(),
							contentType: "text/plain",
						}),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});
		let capturedRequest: { url: string; init?: RequestInit } | undefined;
		globalThis.fetch = async (url, init) => {
			capturedRequest = { url: String(url), init };
			return new Response(null, { status: 204 });
		};

		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		await client.uploads.create.fetch({
			id: "file 1",
			body: "hello",
		});

		assert.equal(capturedRequest?.url, "https://api.test/uploads/file%201");
		assert.equal(capturedRequest?.init?.body, "hello");
		assert.deepEqual(capturedRequest?.init?.headers, {
			"Content-Type": "text/plain",
		});
	});

	it("should stringify application/json custom bodies", async () => {
		const apiContract = defineContract({
			events: {
				create: {
					method: "POST",
					path: "/events",
					request: {
						body: customBody({
							schema: z.object({ type: z.string() }),
							contentType: "application/json",
						}),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});
		let capturedBody: BodyInit | null | undefined;
		globalThis.fetch = async (_url, init) => {
			capturedBody = init?.body;
			return new Response(null, { status: 204 });
		};

		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		await client.events.create.fetch({
			body: { type: "created" },
		});

		assert.equal(capturedBody, '{"type":"created"}');
	});

	it("should reject global content-type headers", async () => {
		const apiContract = defineContract({
			events: {
				create: {
					method: "POST",
					path: "/events",
					request: {
						body: z.object({ type: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});
		globalThis.fetch = async () => new Response(null, { status: 204 });

		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			getHeaders: () => ({ "content-type": "text/plain" }),
		});

		await assert.rejects(
			() => client.events.create.fetch({ type: "created" }),
			/getHeaders\(\) must not return a "content-type" header/,
		);
	});
});

describe("ApiClient flattened request keys", () => {
	it("should reject unknown flattened request keys by default", async () => {
		const apiContract = defineContract({
			todos: {
				list: {
					method: "GET",
					path: "/todos",
					request: {
						query: z.object({ search: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});
		globalThis.fetch = async () => new Response(null, { status: 204 });

		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		await assert.rejects(
			() =>
				client.todos.list.fetch({
					search: "milk",
					unknown: "drop me",
				}),
			/Unknown request key "unknown" for GET \/todos/,
		);
	});

	it("should strip unknown flattened request keys when configured", async () => {
		const apiContract = defineContract({
			todos: {
				list: {
					method: "GET",
					path: "/todos",
					request: {
						query: z.object({ search: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});
		let capturedUrl: string | undefined;
		globalThis.fetch = async (url) => {
			capturedUrl = String(url);
			return new Response(null, { status: 204 });
		};

		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			unknownRequestKeys: "strip",
		});

		await client.todos.list.fetch({
			search: "milk",
			unknown: "drop me",
		});

		assert.equal(capturedUrl, "https://api.test/todos?search=milk");
	});
});

describe("ApiClient Standard Schema validation", () => {
	it("should validate declared response bodies through Standard Schema", async () => {
		const apiContract = defineContract({
			todos: {
				create: {
					method: "POST",
					path: "/todos",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						201: z.object({ id: z.string() }),
					},
				},
			},
		});
		globalThis.fetch = async () =>
			new Response(JSON.stringify({ id: 123 }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			});

		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		await assert.rejects(() =>
			client.todos.create.fetch({ title: "Buy milk" }),
		);
	});

	it("should reject async Standard Schema validation", async () => {
		const asyncSchema: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: async () => ({ value: "ok" }),
			},
		};
		const apiContract = defineContract({
			todos: {
				create: {
					method: "POST",
					path: "/todos",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						201: asyncSchema,
					},
				},
			},
		});
		globalThis.fetch = async () =>
			new Response(JSON.stringify("ok"), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			});

		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		await assert.rejects(
			() => client.todos.create.fetch({ title: "Buy milk" }),
			/Async schema validation is not supported/,
		);
	});
});
