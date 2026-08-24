import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import {
	captureFetch,
	createClientTestContract,
	jsonResponse,
} from "../../test/factories/client.ts";
import {
	customBody,
	formBody,
	multipartBody,
	noBody,
} from "../contract/body.ts";
import { router } from "../contract/contract.ts";
import { jsonQuery } from "../contract/request.ts";
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
			baseUrl: "https://api.test",
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
					pathParams: {
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
			baseUrl: "https://api.test",
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

	it("constructs requests from grouped segments when flattened request keys are disabled", () => {
		const apiContract = router(
			{
				todos: {
					get: {
						method: "GET",
						path: "/todos/:id",
						pathParams: z.object({ id: z.string() }),
						responses: {
							204: noBody(),
						},
					},
				},
			},
			{
				flattenRequestKeys: false,
			},
		);
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.todos.get,
			{
				pathParams: { id: "todo 1" },
			},
			true,
		);

		assert.equal(request.url, "https://api.test/todos/todo%201");
	});

	it("serializes finite number and boolean params, query, and headers", async () => {
		const apiContract = router({
			items: {
				get: {
					method: "GET",
					path: "/items/:id/:visible",
					pathParams: {
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
					pathParams: {
						id: z.string(),
						id2: z.string(),
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
					query: {
						search: z.string().optional(),
					},
					headers: {
						"x-request-id": z.string().optional(),
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

	it("serializes JSON query values into the query parameter", () => {
		const apiContract = router({
			items: {
				search: {
					method: "GET",
					path: "/items",
					query: jsonQuery(
						z.object({
							page: z.number(),
							filters: z.object({ tags: z.array(z.string()) }),
						}),
					),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.search,
			{
				query: {
					page: 2,
					filters: { tags: ["api", "typescript"] },
				},
			},
			"throw",
		);

		assert.equal(
			request.url,
			"https://api.test/items?query=%7B%22page%22%3A2%2C%22filters%22%3A%7B%22tags%22%3A%5B%22api%22%2C%22typescript%22%5D%7D%7D",
		);
	});

	it("omits optional JSON query values when the query key is not provided", () => {
		const apiContract = router({
			items: {
				search: {
					method: "GET",
					path: "/items",
					query: jsonQuery(
						z
							.object({
								page: z.number(),
							})
							.optional(),
					),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.search,
			{},
			"throw",
		);

		assert.equal(request.url, "https://api.test/items");
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
			/Invalid pathParams key "id" for GET \/todos\/:id/,
		);
		assert.throws(
			() =>
				constructBaseRequest(
					"https://api.test",
					apiContract.todos.get,
					{ id: undefined } as never,
					"throw",
				),
			/Invalid pathParams key "id" for GET \/todos\/:id/,
		);
	});

	it("rejects non-scalar query and header values before fetch", () => {
		const apiContract = router({
			items: {
				list: {
					method: "GET",
					path: "/items",
					query: {
						search: z.string().optional(),
					},
					headers: {
						"x-request-id": z.string().optional(),
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
					query: {
						page: z.number(),
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
			baseUrl: "https://api.test",
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
			baseUrl: "https://api.test",
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

	it("sends custom bodies without declared content types as raw fetch bodies", async () => {
		const apiContract = router({
			forms: {
				submit: {
					method: "POST",
					path: "/forms",
					body: customBody(z.instanceof(URLSearchParams)),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const body = new URLSearchParams([["title", "Write docs"]]);

		await client.forms.submit.fetch({ body });

		assert.equal(calls[0]?.init?.body, body);
		assert.deepEqual(calls[0]?.init?.headers, {});
	});

	it("sends form bodies as URLSearchParams without generated content type", async () => {
		const apiContract = router({
			forms: {
				submit: {
					method: "POST",
					path: "/forms",
					body: formBody(
						z.object({
							title: z.string(),
							remember: z.boolean().optional(),
						}),
					),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.forms.submit.fetch({
			body: {
				title: "Write docs",
				remember: true,
			},
		});

		assert.ok(calls[0]?.init?.body instanceof URLSearchParams);
		assert.equal(
			calls[0].init.body.toString(),
			"title=Write+docs&remember=true",
		);
		assert.deepEqual(calls[0]?.init?.headers, {});
	});

	it("sends inferred form array keys as repeated URLSearchParams entries", async () => {
		const apiContract = router({
			forms: {
				submit: {
					method: "POST",
					path: "/forms",
					body: formBody(
						z.object({
							title: z.string(),
							tags: z.array(z.string()),
						}),
					),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.forms.submit.fetch({
			body: {
				title: "Write docs",
				tags: ["ts", "rpc"],
			},
		});

		assert.ok(calls[0]?.init?.body instanceof URLSearchParams);
		assert.equal(
			calls[0].init.body.toString(),
			"title=Write+docs&tags=ts&tags=rpc",
		);
	});

	it("rejects omitted explicit form array keys before sending requests", async () => {
		const apiContract = router({
			forms: {
				submit: {
					method: "POST",
					path: "/forms",
					body: formBody({
						schema: z.object({
							tags: z.array(z.string()),
						}),
						arrayKeys: [],
					}),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await assert.rejects(
			client.forms.submit.fetch({
				body: {
					tags: ["ts", "rpc"],
				},
			}),
			/declared form array key/,
		);
		assert.equal(calls.length, 0);
	});

	it("sends multipart bodies as FormData without generated content type", async () => {
		const apiContract = router({
			uploads: {
				create: {
					method: "POST",
					path: "/uploads",
					body: multipartBody({
						fields: {
							title: z.string(),
							file: z.instanceof(Blob),
							tags: z.array(z.string()).optional(),
						},
						arrayKeys: ["tags"],
					}),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const file = new Blob(["hello"], { type: "text/plain" });

		await client.uploads.create.fetch({
			body: {
				title: "Write docs",
				file,
				tags: ["ts", "rpc"],
			},
		});

		assert.ok(calls[0]?.init?.body instanceof FormData);
		assert.equal(calls[0].init.body.get("title"), "Write docs");
		assert.ok(calls[0].init.body.get("file") instanceof Blob);
		assert.deepEqual(calls[0].init.body.getAll("tags"), ["ts", "rpc"]);
		assert.deepEqual(calls[0]?.init?.headers, {});
	});

	it("rejects omitted explicit multipart array keys before sending requests", async () => {
		const apiContract = router({
			uploads: {
				create: {
					method: "POST",
					path: "/uploads",
					body: multipartBody({
						fields: {
							tags: z.array(z.string()),
						},
						arrayKeys: [],
					}),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await assert.rejects(
			client.uploads.create.fetch({
				body: {
					tags: ["ts", "rpc"],
				},
			}),
			/declared multipart array key/,
		);
		assert.equal(calls.length, 0);
	});

	it("sends custom bodies with a selected declared content type", async () => {
		const apiContract = router({
			uploads: {
				image: {
					method: "POST",
					path: "/uploads/:id/image",
					pathParams: z.object({ id: z.string() }),
					body: customBody({
						contentType: ["image/png", "image/jpeg"],
						schema: z.string(),
					}),
					responses: {
						204: noBody(),
					},
				},
			},
		});
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.uploads.image.fetch({
			id: "file 1",
			body: {
				contentType: "image/jpeg",
				payload: "jpeg bytes",
			},
		});

		assert.equal(calls[0]?.url, "https://api.test/uploads/file%201/image");
		assert.equal(calls[0]?.init?.body, "jpeg bytes");
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "image/jpeg",
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
				body: noBody(),
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
			getGlobalHeaders: () => ({ Authorization: "Bearer token" }),
		});

		await client.todos.list.fetch({ search: "milk" }, { credentials: "omit" });

		assert.equal(calls[0]?.init?.cache, "no-store");
		assert.equal(calls[0]?.init?.credentials, "omit");
		assert.deepEqual(calls[0]?.init?.headers, {
			authorization: "Bearer token",
		});
	});

	it("adds Next fetch tags to GET requests when enabled", async () => {
		const calls = captureFetch((url) =>
			String(url).includes("/todos?search=milk")
				? jsonResponse([])
				: jsonResponse({ id: "todo-1", title: "Buy milk" }, 201),
		);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			fetchOptions: {
				next: {
					revalidate: 60,
					tags: ["manual"],
				},
			} as RequestInit,
			nextFetchTags: {
				enabled: true,
				tagPrefix: "api",
			},
		});

		await client.todos.list.fetch({ search: "milk" });
		await client.todos.create.fetch({ title: "Buy milk" });

		assert.deepEqual(calls[0]?.init?.next, {
			revalidate: 60,
			tags: ["manual", "api:todos.list:search:milk", "api:todos.list"],
		});
		assert.deepEqual(calls[1]?.init?.next, {
			revalidate: 60,
			tags: ["manual"],
		});
	});

	it("lets custom fetch inspect and replace the final request init", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
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
						query: z.object({ search: z.string() }),
						headers: {
							"X-Route": z.string(),
							"x-shared": z.string(),
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
			baseUrl: "https://api.test",
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
			strictRequestKeys: false,
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
					query: z.object({ search: z.string() }),
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

	it("does not start the request timeout when global headers reject", async (t) => {
		const timeout = t.mock.method(
			globalThis,
			"setTimeout",
			(() =>
				0 as unknown as ReturnType<typeof setTimeout>) as typeof setTimeout,
		);
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			timeoutMs: 10_000,
			getGlobalHeaders: async () => {
				throw new Error("headers unavailable");
			},
		});

		await assert.rejects(
			() => client.todos.list.fetch({ search: "milk" }),
			/headers unavailable/,
		);

		assert.equal(timeout.mock.callCount(), 0);
	});

	it("clears the request timeout before response parsing", async () => {
		let requestSignal: AbortSignal | null | undefined;
		globalThis.fetch = async (_url, init) => {
			requestSignal = init?.signal;
			return new Response(
				new ReadableStream({
					async start(controller) {
						await new Promise((resolve) => setTimeout(resolve, 15));
						controller.enqueue(
							new TextEncoder().encode(JSON.stringify([{ id: "todo-1" }])),
						);
						controller.close();
					},
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		};
		const client = initClient(createClientTestContract(), {
			baseUrl: "https://api.test",
			timeoutMs: 5,
		});

		await client.todos.list.fetch({ search: "milk" });

		assert.equal(requestSignal?.aborted, false);
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
