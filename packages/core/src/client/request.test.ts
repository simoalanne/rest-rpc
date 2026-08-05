import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { router } from "../contract/define.ts";
import { noBody } from "../contract/route.ts";
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

describe("ApiClient requests", () => {
	it("builds URLs from params and query keys", async () => {
		const calls = captureFetch((url) =>
			String(url).includes("/todos/todo%201")
				? jsonResponse({ id: "todo 1", title: "Buy milk" })
				: jsonResponse([]),
		);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.todos.get.fetch({ id: "todo 1" });
		await client.todos.list.fetch({ search: "milk", empty: null });

		assert.equal(calls[0]?.url, "https://api.test/todos/todo%201");
		assert.equal(calls[1]?.url, "https://api.test/todos?search=milk");
	});

	it("sends JSON request bodies with generated content type", async () => {
		const calls = captureFetch(
			jsonResponse({ id: "todo-1", title: "Buy milk" }, 201),
		);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.todos.create.fetch({ title: "Buy milk" });

		assert.equal(calls[0]?.init?.body, '{"title":"Buy milk"}');
		assert.deepEqual(calls[0]?.init?.headers, {
			"Content-Type": "application/json",
		});
	});

	it("sends custom bodies with their declared content type", async () => {
		const calls = captureFetch();
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.uploads.create.fetch({
			id: "file 1",
			body: "hello",
		});

		assert.equal(calls[0]?.url, "https://api.test/uploads/file%201");
		assert.equal(calls[0]?.init?.body, "hello");
		assert.deepEqual(calls[0]?.init?.headers, {
			"Content-Type": "text/plain",
		});
	});

	it("stringifies application/json custom bodies", async () => {
		const calls = captureFetch();
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.uploads.json.fetch({
			body: { type: "created" },
		});

		assert.equal(calls[0]?.init?.body, '{"type":"created"}');
	});

	it("treats explicit no-body request declarations as options-only routes", async () => {
		const apiContract = router({
			ping: {
				method: "POST",
				path: "/ping",
				request: {
					body: noBody(),
				},
				responses: {
					204: noBody(),
				},
			},
		});
		const calls = captureFetch();
		const controller = new AbortController();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.ping.fetch({ signal: controller.signal });

		assert.equal(calls[0]?.url, "https://api.test/ping");
		assert.equal(calls[0]?.init?.body, undefined);
		assert.deepEqual(calls[0]?.init?.headers, {});
		assert.equal(calls[0]?.init?.signal, controller.signal);
	});

	it("merges global fetch options and per-call options", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			fetchOptions: {
				cache: "no-store",
				credentials: "include",
			},
			getHeaders: () => ({ Authorization: "Bearer token" }),
		});

		await client.todos.list.fetch({ search: "milk" }, { credentials: "omit" });

		assert.equal(calls[0]?.init?.cache, "no-store");
		assert.equal(calls[0]?.init?.credentials, "omit");
		assert.deepEqual(calls[0]?.init?.headers, {
			Authorization: "Bearer token",
		});
	});

	it("sends declared request headers over global headers", async () => {
		const apiContract = router(
			{
				todos: {
					list: {
						method: "GET",
						path: "/todos",
						request: {
							query: z.object({ search: z.string() }),
							headers: {
								"x-route": z.string(),
								"x-shared": z.string(),
							},
						},
						responses: {
							200: z.array(z.object({ id: z.string(), title: z.string() })),
						},
					},
				},
			},
			{
				commonHeaders: {
					"x-common": z.number(),
					"x-shared": z.number(),
				},
			},
		);
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			getHeaders: () => ({
				"x-common": "from global",
				"x-global": "global",
				"x-route": "from global",
				"x-shared": "from global",
			}),
		});

		await client.todos.list.fetch({
			search: "milk",
			"x-common": 123,
			"x-route": "route",
			"x-shared": "route shared",
		});

		assert.equal(calls[0]?.url, "https://api.test/todos?search=milk");
		assert.deepEqual(calls[0]?.init?.headers, {
			"x-common": "123",
			"x-global": "global",
			"x-route": "route",
			"x-shared": "route shared",
		});
	});

	it("rejects global content-type headers", async () => {
		captureFetch();
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			getHeaders: () => ({ "content-type": "text/plain" }),
		});

		await assert.rejects(
			() => client.todos.create.fetch({ title: "created" }),
			/getHeaders\(\) must not return a "content-type" header/,
		);
	});

	it("rejects unknown flattened request keys by default", async () => {
		captureFetch();
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
		});

		await assert.rejects(
			() =>
				client.todos.list.fetch({
					search: "milk",
					unknown: "drop me",
				}),
			/Unknown request key "unknown" for GET \/todos/,
		);
	});

	it("strips unknown flattened request keys when configured", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			unknownRequestKeys: "strip",
		});

		await client.todos.list.fetch({
			search: "milk",
			unknown: "drop me",
		});

		assert.equal(calls[0]?.url, "https://api.test/todos?search=milk");
	});

	it("requires request key metadata for unvalidated contracts", async () => {
		const apiContract = {
			todos: {
				list: {
					method: "GET",
					path: "/todos",
					request: {
						query: z.object({ search: z.string() }),
					},
					responses: {
						204: noBody(),
					},
				},
			},
		} as const;
		captureFetch();
		const client = initClient(apiContract, { baseUrl: "https://api.test" });

		await assert.rejects(
			() => client.todos.list.fetch({ search: "milk" }),
			/Missing request key metadata/,
		);
	});

	it("cleans up timeout signals after fetch failures", async () => {
		let abortEventCount = 0;
		globalThis.fetch = async (_url, init) => {
			init?.signal?.addEventListener("abort", () => {
				abortEventCount += 1;
			});
			throw new Error("network down");
		};
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			timeoutMs: 5,
		});

		await assert.rejects(() => client.todos.list.fetch({ search: "milk" }));
		await new Promise((resolve) => setTimeout(resolve, 15));

		assert.equal(abortEventCount, 0);
	});
});
