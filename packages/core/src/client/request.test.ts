import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import {
	captureFetch,
	createClientTestContract,
	jsonResponse,
} from "../../test/factories/client.ts";
import { router } from "../contract/define.ts";
import { noBody } from "../contract/route.ts";
import { initClient } from "./index.ts";
import { constructBaseRequest, createRequestSignal } from "./request.ts";

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
			origin: "https://api.test",
		});

		await client.todos.get.fetch({ id: "todo 1" });
		await client.todos.list.fetch({ search: "milk", empty: undefined });

		assert.equal(calls[0]?.url, "https://api.test/todos/todo%201");
		assert.equal(calls[1]?.url, "https://api.test/todos?search=milk");
	});

	it("builds requests from schema record request declarations", async () => {
		const apiContract = router({
			todos: {
				update: {
					method: "POST",
					path: "/todos/:id",
					request: {
						params: {
							id: z.string(),
						},
						query: {
							page: z.number(),
						},
						body: {
							title: z.string(),
						},
						headers: {
							"x-request-id": z.number(),
						},
					},
					responses: {
						200: z.object({ id: z.string(), title: z.string() }),
					},
				},
			},
		});
		const calls = captureFetch(
			jsonResponse({ id: "todo-1", title: "Updated" }),
		);
		const client = initClient(apiContract, {
			origin: "https://api.test",
		});

		await client.todos.update.fetch({
			id: "todo-1",
			page: 2,
			title: "Updated",
			"x-request-id": 123,
		});

		assert.equal(calls[0]?.url, "https://api.test/todos/todo-1?page=2");
		assert.equal(calls[0]?.init?.body, '{"title":"Updated"}');
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "application/json",
			"x-request-id": "123",
		});
	});

	it("serializes finite number and boolean params, query, and headers", async () => {
		const apiContract = router({
			items: {
				get: {
					method: "GET",
					path: "/items/:id/:visible",
					request: {
						params: {
							id: z.number(),
							visible: z.boolean(),
						},
						query: {
							page: z.number(),
							includeArchived: z.boolean(),
						},
						headers: {
							"x-page": z.number(),
							"x-visible": z.boolean(),
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.get,
			{
				id: 12,
				visible: false,
				page: 2,
				includeArchived: true,
				"x-page": 2,
				"x-visible": false,
			},
			"throw",
		);

		assert.equal(
			request.url,
			"https://api.test/items/12/false?page=2&includeArchived=true",
		);
		assert.deepEqual(request.headers, {
			"x-page": "2",
			"x-visible": "false",
		});
	});

	it("serializes path params by matching full path placeholders", () => {
		const apiContract = router({
			items: {
				get: {
					method: "GET",
					path: "/items/:id/:id2",
					request: {
						params: {
							id: z.string(),
							id2: z.string(),
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.get,
			{
				id: "one/two",
				id2: "three",
			},
			"throw",
		);

		assert.equal(request.url, "https://api.test/items/one%2Ftwo/three");
	});

	it("omits undefined query and header values", async () => {
		const apiContract = router({
			items: {
				list: {
					method: "GET",
					path: "/items",
					request: {
						query: {
							search: z.string().optional(),
						},
						headers: {
							"x-request-id": z.string().optional(),
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.list,
			{
				search: undefined,
				"x-request-id": undefined,
			},
			"throw",
		);

		assert.equal(request.url, "https://api.test/items");
		assert.deepEqual(request.headers, {});
	});

	it("rejects missing and undefined params before building the request URL", () => {
		const apiContract = createClientTestContract();

		assert.throws(
			() =>
				constructBaseRequest(
					"https://api.test",
					apiContract.todos.get,
					{} as never,
					"throw",
				),
			/Invalid params key "id" for GET \/todos\/:id/,
		);
		assert.throws(
			() =>
				constructBaseRequest(
					"https://api.test",
					apiContract.todos.get,
					{ id: undefined } as never,
					"throw",
				),
			/Invalid params key "id" for GET \/todos\/:id/,
		);
	});

	it("rejects non-scalar query and header values before fetch", () => {
		const apiContract = router({
			items: {
				list: {
					method: "GET",
					path: "/items",
					request: {
						query: {
							search: z.string().optional(),
						},
						headers: {
							"x-request-id": z.string().optional(),
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.throws(
			() =>
				constructBaseRequest(
					"https://api.test",
					apiContract.items.list,
					{ search: null } as never,
					"throw",
				),
			/Invalid query key "search" for GET \/items/,
		);
		assert.throws(
			() =>
				constructBaseRequest(
					"https://api.test",
					apiContract.items.list,
					{ search: { q: "milk" } } as never,
					"throw",
				),
			/Invalid query key "search" for GET \/items/,
		);
		assert.throws(
			() =>
				constructBaseRequest(
					"https://api.test",
					apiContract.items.list,
					{ "x-request-id": [] } as never,
					"throw",
				),
			/Invalid headers key "x-request-id" for GET \/items/,
		);
	});

	it("rejects non-finite number query values before fetch", () => {
		const apiContract = router({
			items: {
				list: {
					method: "GET",
					path: "/items",
					request: {
						query: {
							page: z.number(),
						},
					},
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.throws(
			() =>
				constructBaseRequest(
					"https://api.test",
					apiContract.items.list,
					{ page: Number.NaN } as never,
					"throw",
				),
			/Invalid query key "page" for GET \/items/,
		);
	});

	it("sends JSON request bodies with generated content type", async () => {
		const calls = captureFetch(
			jsonResponse({ id: "todo-1", title: "Buy milk" }, 201),
		);
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
		});

		await client.todos.create.fetch({ title: "Buy milk" });

		assert.equal(calls[0]?.init?.body, '{"title":"Buy milk"}');
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "application/json",
		});
	});

	it("sends custom bodies with their declared content type", async () => {
		const calls = captureFetch();
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
		});

		await client.uploads.create.fetch({
			id: "file 1",
			body: "hello",
		});

		assert.equal(calls[0]?.url, "https://api.test/uploads/file%201");
		assert.equal(calls[0]?.init?.body, "hello");
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "text/plain",
		});
	});

	it("stringifies application/json custom bodies", async () => {
		const calls = captureFetch();
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
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
			origin: "https://api.test",
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
			origin: "https://api.test",
			fetchOptions: {
				cache: "no-store",
				credentials: "include",
			},
			getGlobalHeaders: () => ({ Authorization: "Bearer token" }),
		});

		await client.todos.list.fetch({ search: "milk" }, { credentials: "omit" });

		assert.equal(calls[0]?.init?.cache, "no-store");
		assert.equal(calls[0]?.init?.credentials, "omit");
		assert.deepEqual(calls[0]?.init?.headers, {
			authorization: "Bearer token",
		});
	});

	it("lets custom fetch inspect and replace the final request init", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
			fetch: async (url, init) => {
				assert.equal(url, "https://api.test/todos?search=milk");
				assert.equal(init?.method, "GET");

				const preparedInit = {
					...init,
					headers: {
						...(init?.headers as Record<string, string>),
						"x-custom-fetch": "true",
					},
				};

				calls.push({ url: String(url), init: preparedInit });
				return jsonResponse([]);
			},
		});

		await client.todos.list.fetch({ search: "milk" });

		assert.deepEqual(calls[0]?.init?.headers, {
			"x-custom-fetch": "true",
		});
	});

	it("normalizes merged headers and lets declared request headers win", async () => {
		const apiContract = router(
			{
				todos: {
					list: {
						method: "GET",
						path: "/todos",
						request: {
							query: z.object({ search: z.string() }),
							headers: {
								"X-Route": z.string(),
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
			origin: "https://api.test",
			getGlobalHeaders: () => ({
				"X-Global": "global",
				"X-Route": "from global",
				"X-Shared": "from global",
			}),
		});

		await client.todos.list.fetch({
			search: "milk",
			"x-common": 123,
			"X-Route": "route",
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
			origin: "https://api.test",
			getGlobalHeaders: () => ({ "content-type": "text/plain" }),
		});

		await assert.rejects(
			() => client.todos.create.fetch({ title: "created" }),
			/getGlobalHeaders\(\) must not return a "content-type" header/,
		);
	});

	it("rejects unknown flattened request keys by default", async () => {
		captureFetch();
		const client = initClient(createClientTestContract(), {
			origin: "https://api.test",
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
			origin: "https://api.test",
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
		const client = initClient(apiContract, { origin: "https://api.test" });

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
			origin: "https://api.test",
			timeoutMs: 5,
		});

		await assert.rejects(() => client.todos.list.fetch({ search: "milk" }));
		await new Promise((resolve) => setTimeout(resolve, 15));

		assert.equal(abortEventCount, 0);
	});

	it("creates timeout signals that abort and can be cleaned up", async () => {
		const signalState = createRequestSignal(undefined, 5);
		assert.ok(signalState);

		let aborted = false;
		signalState.signal.addEventListener("abort", () => {
			aborted = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 15));

		assert.equal(aborted, true);

		const cleanedUpSignalState = createRequestSignal(undefined, 20);
		assert.ok(cleanedUpSignalState);
		cleanedUpSignalState.cleanup();
		await new Promise((resolve) => setTimeout(resolve, 30));

		assert.equal(cleanedUpSignalState.signal.aborted, false);
	});
});
