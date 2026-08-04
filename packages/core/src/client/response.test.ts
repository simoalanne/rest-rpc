import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { defineContract } from "../contract/define.ts";
import { noBody } from "../contract/route.ts";
import type { StandardSchemaV1 } from "../standardSchema.ts";
import {
	captureFetch,
	createClientTestContract,
	jsonResponse,
} from "./factories.ts";
import { initClient } from "./index.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("ApiClient responses", () => {
	it("returns declared response metadata from fetchResponse", async () => {
		captureFetch(jsonResponse({ code: "not_found" }, 404));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.get.fetchResponse({ id: "missing" });

		assert.deepEqual(response, {
			declared: true,
			status: 404,
			body: { code: "not_found" },
		});
	});

	it("rejects fetch when the response is not a declared success", async () => {
		captureFetch(jsonResponse({ code: "not_found" }, 404));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await assert.rejects(
			() => client.todos.get.fetch({ id: "missing" }),
			/declared success response/,
		);
	});

	it("returns undeclared JSON response bodies", async () => {
		captureFetch(jsonResponse({ code: "teapot" }, 418));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.get.fetchResponse({ id: "todo-1" });

		assert.deepEqual(response, {
			declared: false,
			status: 418,
			body: { code: "teapot" },
		});
	});

	it("returns undeclared text and empty response bodies", async () => {
		captureFetch((url) =>
			String(url).includes("empty")
				? new Response(null, { status: 418 })
				: new Response("plain error", { status: 418 }),
		);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		const textResponse = await client.todos.get.fetchResponse({ id: "text" });
		const emptyResponse = await client.todos.get.fetchResponse({ id: "empty" });

		assert.equal(textResponse.body, "plain error");
		assert.equal(emptyResponse.body, undefined);
	});

	it("validates declared response bodies through Standard Schema", async () => {
		captureFetch(jsonResponse({ id: 123 }, 201));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await assert.rejects(() =>
			client.todos.create.fetch({ title: "Buy milk" }),
		);
	});

	it("rejects async Standard Schema validation", async () => {
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
		captureFetch(jsonResponse("ok", 201));

		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		await assert.rejects(
			() => client.todos.create.fetch({ title: "Buy milk" }),
			/Async schema validation is not supported/,
		);
	});

	it("reads noBody responses as undefined", async () => {
		const apiContract = defineContract({
			todos: {
				remove: {
					method: "DELETE",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});
		captureFetch(new Response(null, { status: 204 }));
		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		const response = await client.todos.remove.fetch({ id: "todo-1" });

		assert.equal(response, undefined);
	});
});
