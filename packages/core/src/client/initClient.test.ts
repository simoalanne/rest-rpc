import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { route } from "../contract/routeBuilder.ts";
import { initClient } from "./initClient.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type FetchCall = {
	url: string;
	init?: RequestInit;
};

const apiContract = {
	todos: {
		list: route
			.get("/todos")
			.query(
				z.object({
					search: z.string().optional(),
				}),
			)
			.response(200, z.array(z.object({ id: z.string() }))),
		publish: route
			.post("/todos/:id/publish")
			.params(z.object({ id: z.string() }))
			.response(200, z.object({ id: z.string() }))
			.response(202, z.object({ queued: z.literal(true) })),
	},
};

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

const captureFetch = (response: Response) => {
	const calls: FetchCall[] = [];

	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return response;
	};

	return calls;
};

describe("initClient", () => {
	it("creates callable HTTP routes", () => {
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		assert.deepEqual(Object.keys(client.todos.list), []);
		assert.deepEqual(Object.keys(client.todos.publish), []);
	});

	it("returns the API tree directly", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.todos.list({ query: { search: "milk" } });

		assert.equal(calls[0]?.url, "https://api.test/todos?search=milk");
	});

	it("calls shorthand routes as derived JSON POST operations", async () => {
		const calls: FetchCall[] = [];
		globalThis.fetch = async (url, init) => {
			calls.push({ url: String(url), init });
			return jsonResponse(String(calls.length));
		};
		const contract = {
			todos: {
				get: route.output(z.string().transform(Number)),
				add: route
					.input(z.object({ title: z.string() }))
					.output(z.string().transform(Number)),
				list: route.get("/todos").response(200, z.array(z.string())),
			},
		};
		const client = initClient(contract, {
			baseUrl: "https://api.test",
			validateResponses: true,
		});

		assert.equal(await client.todos.get(undefined, { cache: "no-store" }), 1);
		assert.equal(await client.todos.add({ title: "Write tests" }), 2);
		assert.deepEqual(Object.keys(client.todos), ["get", "add", "list"]);
		assert.deepEqual(Object.keys(client.todos.list), []);
		assert.equal(calls[0]?.url, "https://api.test/todos/get");
		assert.equal(calls[0]?.init?.method, "POST");
		assert.equal(calls[0]?.init?.body, undefined);
		assert.equal(calls[0]?.init?.cache, "no-store");
		assert.equal(calls[1]?.url, "https://api.test/todos/add");
		assert.equal(calls[1]?.init?.method, "POST");
		assert.equal(
			calls[1]?.init?.body,
			JSON.stringify({ title: "Write tests" }),
		);
		assert.equal(
			new Headers(calls[1]?.init?.headers).get("content-type"),
			"application/json",
		);
	});

	it("throws native errors for unsuccessful shorthand requests", async () => {
		captureFetch(jsonResponse({ code: "failed" }, 500));
		const client = initClient(
			{ todos: { get: route.output(z.object({ id: z.string() })) } },
			{
				baseUrl: "https://api.test",
			},
		);

		await assert.rejects(client.todos.get(), Error);
	});
});
