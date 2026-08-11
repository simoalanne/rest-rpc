import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import {
	captureFetch,
	createClientTestContract,
	jsonResponse,
} from "../../test/factories/client.ts";
import { router } from "../contract/define.ts";
import { customBody, noBody, stream } from "../contract/route.ts";
import { initClient } from "./index.ts";
import { fetchResponse } from "./response.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("ApiClient responses", () => {
	it("returns declared response metadata from fetchResponse", async () => {
		captureFetch(jsonResponse({ code: "not_found" }, 404));
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
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
			origin: "https://api.test",
		});

		await assert.rejects(
			() => client.todos.get.fetch({ id: "missing" }),
			/declared success response/,
		);
	});

	it("returns undeclared JSON response bodies", async () => {
		captureFetch(jsonResponse({ code: "teapot" }, 418));
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
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
			origin: "https://api.test",
		});

		const textResponse = await client.todos.get.fetchResponse({ id: "text" });
		const emptyResponse = await client.todos.get.fetchResponse({ id: "empty" });

		assert.equal(textResponse.body, "plain error");
		assert.equal(emptyResponse.body, undefined);
	});

	it("trusts declared response bodies by default", async () => {
		captureFetch(jsonResponse({ id: 123 }, 201));
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
		});

		const response = await client.todos.create.fetch({ title: "Buy milk" });

		assert.deepEqual(response, { id: 123 });
	});

	it("validates declared response bodies when configured", async () => {
		captureFetch(jsonResponse({ id: 123 }, 201));
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
			validateResponses: true,
		});

		await assert.rejects(() =>
			client.todos.create.fetch({ title: "Buy milk" }),
		);
	});

	it("returns transformed response output when validation is disabled", async () => {
		const responseSchema = z.object({
			id: z.string(),
			name: z
				.object({
					first: z.string(),
					last: z.string(),
				})
				.transform(({ first, last }) => `${first} ${last}`),
		});
		const apiContract = router({
			todos: {
				get: {
					method: "GET",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						200: responseSchema,
					},
				},
			},
		});
		const serverOutput = responseSchema.parse({
			id: "todo-1",
			name: {
				first: "Ada",
				last: "Lovelace",
			},
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			origin: "https://api.test",
		});

		const response = await client.todos.get.fetch({ id: "todo-1" });

		assert.deepEqual(response, {
			id: "todo-1",
			name: "Ada Lovelace",
		});
	});

	it("rejects transformed response output that no longer matches response input when validation is enabled", async () => {
		const responseSchema = z.object({
			id: z.string(),
			name: z
				.object({
					first: z.string(),
					last: z.string(),
				})
				.transform(({ first, last }) => `${first} ${last}`),
		});
		const apiContract = router({
			todos: {
				get: {
					method: "GET",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						200: responseSchema,
					},
				},
			},
		});
		const serverOutput = responseSchema.parse({
			id: "todo-1",
			name: {
				first: "Ada",
				last: "Lovelace",
			},
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			origin: "https://api.test",
			validateResponses: true,
		});

		await assert.rejects(() => client.todos.get.fetch({ id: "todo-1" }));
	});

	it("returns serialized Date transform output when validation is disabled", async () => {
		const responseSchema = z.object({
			createdAt: z
				.string()
				.datetime()
				.transform((value) => new Date(value)),
		});
		const apiContract = router({
			todos: {
				get: {
					method: "GET",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						200: responseSchema,
					},
				},
			},
		});
		const serverOutput = responseSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			origin: "https://api.test",
		});
		const response = await client.todos.get.fetch({ id: "todo-1" });

		assert.equal(response.createdAt, "2026-08-10T00:00:00.000Z");
	});

	it("parses serialized Date transform output when validation is enabled", async () => {
		const responseSchema = z.object({
			createdAt: z
				.string()
				.datetime()
				.transform((value) => new Date(value)),
		});
		const apiContract = router({
			todos: {
				get: {
					method: "GET",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						200: responseSchema,
					},
				},
			},
		});
		const serverOutput = responseSchema.parse({
			createdAt: "2026-08-10T00:00:00.000Z",
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			origin: "https://api.test",
			validateResponses: true,
		});
		const response = await client.todos.get.fetch({ id: "todo-1" });

		assert.ok(response.createdAt instanceof Date);
		assert.equal(response.createdAt.toISOString(), "2026-08-10T00:00:00.000Z");
	});

	it("returns string response output when a Date response schema serializes to JSON", async () => {
		const responseSchema = z.object({
			id: z.string(),
			createdAt: z.date().transform((value) => value.toISOString()),
		});
		const apiContract = router({
			todos: {
				get: {
					method: "GET",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						200: responseSchema,
					},
				},
			},
		});
		const serverOutput = responseSchema.parse({
			id: "todo-1",
			createdAt: new Date("2026-08-10T00:00:00.000Z"),
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const client = initClient(apiContract, {
			origin: "https://api.test",
		});
		const response = await client.todos.get.fetch({ id: "todo-1" });

		assert.deepEqual(response, {
			id: "todo-1",
			createdAt: "2026-08-10T00:00:00.000Z",
		});
	});

	it("returns serialized Date response output by default but rejects it when validation is enabled", async () => {
		const responseSchema = z.object({ createdAt: z.date() });
		const apiContract = router({
			todos: {
				get: {
					method: "GET",
					path: "/todos/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						200: responseSchema,
					},
				},
			},
		});
		const serverOutput = responseSchema.parse({
			createdAt: new Date("2026-08-10T00:00:00.000Z"),
		});
		const wireBody = JSON.parse(JSON.stringify(serverOutput));

		captureFetch(jsonResponse(wireBody, 200));
		const trustingClient = initClient(apiContract, {
			origin: "https://api.test",
		});
		const trusted = await trustingClient.todos.get.fetch({ id: "todo-1" });

		assert.equal(trusted.createdAt, "2026-08-10T00:00:00.000Z");

		captureFetch(jsonResponse(wireBody, 200));
		const validatingClient = initClient(apiContract, {
			origin: "https://api.test",
			validateResponses: true,
		});

		await assert.rejects(() =>
			validatingClient.todos.get.fetch({ id: "todo-1" }),
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
		const client = initClient(apiContract, { origin: "https://api.test" });

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
			origin: "https://api.test",
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
		const client = initClient(apiContract, { origin: "https://api.test" });

		const response = await client.reports.csv.fetch();

		assert.ok(response instanceof Response);
		assert.equal(await response.text(), "id,title\n1,First\n");
	});

	it("runs request cleanup when reading a declared response fails", async () => {
		let cleanedUp = false;
		const apiContract = createClientTestContract();

		await assert.rejects(() =>
			fetchResponse(
				async () => ({
					rawResponse: new Response("not json", {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
					cleanup: () => {
						cleanedUp = true;
					},
				}),
				false,
				apiContract.todos.get,
				{ id: "todo-1" },
			),
		);

		assert.equal(cleanedUp, true);
	});
});
