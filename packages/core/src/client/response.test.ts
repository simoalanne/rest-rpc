import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { router } from "../contract/define.ts";
import { customBody, noBody, stream } from "../contract/route.ts";
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
			headers: new Headers(),
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
			headers: new Headers(),
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

	it("trusts declared response bodies by default", async () => {
		captureFetch(jsonResponse({ id: 123 }, 201));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		const response = await client.todos.create.fetch({ title: "Buy milk" });

		assert.deepEqual(response, { id: 123 });
	});

	it("validates declared response bodies when configured", async () => {
		captureFetch(jsonResponse({ id: 123 }, 201));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		await assert.rejects(() =>
			client.todos.create.fetch({ title: "Buy milk" }),
		);
	});

	it("reads noBody responses as undefined", async () => {
		const apiContract = router({
			todos: {
				remove: {
					method: "DELETE",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});
		captureFetch(new Response(null, { status: 204 }));
		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		const response = await client.todos.remove.fetch({ id: "todo-1" });

		assert.equal(response, undefined);
	});

	it("returns declared custom responses as native Response objects", async () => {
		const apiContract = router({
			reports: {
				csv: {
					method: "GET",
					path: "/reports.csv",
					responses: {
						200: customBody({
							contentType: "text/csv",
							schema: z.string(),
						}),
					},
				},
			},
		});
		captureFetch(
			new Response("id,title\n1,First\n", {
				status: 200,
				headers: { "content-type": "text/csv" },
			}),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		const response = await client.reports.csv.fetch();

		assert.ok(response instanceof Response);
		assert.equal(response.headers.get("content-type"), "text/csv");
		assert.equal(await response.text(), "id,title\n1,First\n");
	});

	it("returns declared custom stream responses as native Response objects", async () => {
		const apiContract = router({
			reports: {
				csv: {
					method: "GET",
					path: "/reports.csv",
					responses: {
						200: stream(
							customBody({
								contentType: "text/csv",
								schema: z.string(),
							}),
						),
					},
				},
			},
		});
		captureFetch(new Response("id,title\n1,First\n", { status: 200 }));
		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		const response = await client.reports.csv.fetch();

		assert.ok(response instanceof Response);
		assert.equal(await response.text(), "id,title\n1,First\n");
	});
});
