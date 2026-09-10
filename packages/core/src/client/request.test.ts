import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import z from "zod";
import { route } from "../contract/routeFactory.ts";
import { type } from "../standard-schema/index.ts";
import { initClient } from "./index.ts";
import { constructBaseRequest, createRequestSignal } from "./request.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type FetchCall = {
	url: string;
	init?: RequestInit;
};

const createRequestTestContract = () => ({
	todos: {
		list: route
			.get("/todos")
			.query(
				z.object({
					search: z.string().optional(),
					empty: z.string().optional(),
					tags: z.array(z.string()).optional(),
				}),
			)
			.response(200, z.array(z.object({ id: z.string(), title: z.string() }))),
		create: route
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, z.object({ id: z.string(), title: z.string() })),
		get: route
			.get("/todos/:id")
			.params(
				z.object({
					id: z.string(),
				}),
			)
			.response(200, z.object({ id: z.string(), title: z.string() })),
	},
	uploads: {
		create: route
			.post("/uploads/:id")
			.params(
				z.object({
					id: z.string(),
				}),
			)
			.customBody({
				schema: z.string(),
				contentType: "text/plain",
			})
			.response(204),
		json: route
			.post("/uploads/json")
			.customBody({
				schema: z.object({ type: z.string() }),
				contentType: "application/json",
			})
			.response(204),
	},
});

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

const captureFetch = (
	response:
		| Response
		| ((
				url: URL | RequestInfo,
				init?: RequestInit,
		  ) => Response | Promise<Response>) = new Response(null, { status: 204 }),
) => {
	const calls: FetchCall[] = [];

	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return typeof response === "function" ? response(url, init) : response;
	};

	return calls;
};

describe("ApiClient requests", () => {
	it("builds URLs from params and query keys", async () => {
		const calls = captureFetch((url) =>
			String(url).includes("/todos/todo%201")
				? jsonResponse({ id: "todo 1", title: "Buy milk" })
				: jsonResponse([]),
		);
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.todos.get({
			params: { id: "todo 1" },
		});
		await client.todos.list({
			query: {
				search: "milk",
				empty: undefined,
				tags: ["typescript", "rpc"],
			},
		});

		assert.equal(calls[0]?.url, "https://api.test/todos/todo%201");
		assert.equal(
			calls[1]?.url,
			"https://api.test/todos?search=milk&tags%5B%5D=typescript&tags%5B%5D=rpc",
		);
	});

	it("builds requests from object-schema request declarations", async () => {
		const apiContract = {
			todos: {
				update: route
					.post("/todos/:id")
					.params(
						z.object({
							id: z.string(),
						}),
					)
					.query(
						z.object({
							page: z.number(),
						}),
					)
					.body(z.object({ title: z.string() }))
					.headers(z.object({ "x-request-id": z.number() }))
					.response(200, z.object({ id: z.string(), title: z.string() })),
			},
		};
		const calls = captureFetch(
			jsonResponse({ id: "todo-1", title: "Updated" }),
		);
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.todos.update({
			params: { id: "todo-1" },
			query: { page: 2 },
			body: { title: "Updated" },
			headers: { "x-request-id": 123 },
		});

		assert.equal(calls[0]?.url, "https://api.test/todos/todo-1?page=2");
		assert.equal(calls[0]?.init?.body, '{"title":"Updated"}');
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "application/json",
			"x-request-id": "123",
		});
	});

	it("constructs requests from grouped segments under explicit HTTP segments", () => {
		const groupedRoute = route;
		const apiContract = {
			todos: {
				get: groupedRoute
					.get("/todos/:id")
					.params(
						z.object({
							id: z.string(),
						}),
					)
					.response(204),
			},
		};
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.todos.get,
			{
				params: { id: "todo 1" },
			},
		);

		assert.equal(request.url, "https://api.test/todos/todo%201");
	});

	it("serializes finite number and boolean params, query, and headers", async () => {
		const apiContract = {
			items: {
				get: route
					.get("/items/:id/:visible")
					.params(
						z.object({
							id: z.number(),
							visible: z.boolean(),
						}),
					)
					.query(
						z.object({
							page: z.number(),
							includeArchived: z.boolean(),
						}),
					)
					.headers(z.object({ "x-page": z.number(), "x-visible": z.boolean() }))
					.response(204),
			},
		};
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.get,
			{
				params: { id: 12, visible: false },
				query: { page: 2, includeArchived: true },
				headers: { "x-page": 2, "x-visible": false },
			},
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
		const apiContract = {
			items: {
				get: route
					.get("/items/:id/:id2")
					.params(
						z.object({
							id: z.string(),
							id2: z.string(),
						}),
					)
					.response(204),
			},
		};
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.get,
			{
				params: {
					id: "one/two",
					id2: "three",
				},
			},
		);

		assert.equal(request.url, "https://api.test/items/one%2Ftwo/three");
	});

	it("rejects missing path params before sending requests", () => {
		const declaration = route
			.get("/items/:id")
			.params(
				z.object({
					id: z.string(),
				}),
			)
			.response(204);

		assert.throws(
			() => constructBaseRequest("https://api.test", declaration, {}),
			/Missing path param "id" for GET \/items\/:id\./,
		);
	});

	it("omits undefined query and header values", async () => {
		const apiContract = {
			items: {
				list: route
					.get("/items")
					.query(
						z.object({
							search: z.string().optional(),
						}),
					)
					.headers(z.object({ "x-request-id": z.string().optional() }))
					.response(204),
			},
		};
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.list,
			{
				search: undefined,
				"x-request-id": undefined,
			},
		);

		assert.equal(request.url, "https://api.test/items");
		assert.deepEqual(request.headers, {});
	});

	it("serializes JSON query values into the query parameter", () => {
		const apiContract = {
			items: {
				search: route
					.get("/items")
					.jsonQuery(
						z.object({
							page: z.number(),
							filters: z.object({
								tags: z.array(z.string()),
							}),
						}),
					)
					.response(204),
			},
		};
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.search,
			{
				query: {
					page: 2,
					filters: { tags: ["api", "typescript"] },
				},
			},
		);

		assert.equal(
			request.url,
			"https://api.test/items?query=%7B%22page%22%3A2%2C%22filters%22%3A%7B%22tags%22%3A%5B%22api%22%2C%22typescript%22%5D%7D%7D",
		);
	});

	it("omits optional JSON query values when the query key is not provided", () => {
		const apiContract = {
			items: {
				search: route
					.get("/items")
					.jsonQuery(
						z
							.object({
								page: z.number(),
							})
							.optional(),
					)
					.response(204),
			},
		};
		const request = constructBaseRequest(
			"https://api.test",
			apiContract.items.search,
			{},
		);

		assert.equal(request.url, "https://api.test/items");
	});

	it("sends JSON request bodies with generated content type", async () => {
		const calls = captureFetch(
			jsonResponse({ id: "todo-1", title: "Buy milk" }, 201),
		);
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.todos.create({ body: { title: "Buy milk" } });

		assert.equal(calls[0]?.init?.body, '{"title":"Buy milk"}');
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "application/json",
		});
	});

	it("sends custom bodies with their declared content type", async () => {
		const calls = captureFetch();
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.uploads.create({ body: "hello", params: { id: "file 1" } });

		assert.equal(calls[0]?.url, "https://api.test/uploads/file%201");
		assert.equal(calls[0]?.init?.body, "hello");
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "text/plain",
		});
	});

	it("sends custom bodies without declared content types as raw fetch bodies", async () => {
		const apiContract = {
			forms: {
				submit: route
					.post("/forms")
					.customBody(z.instanceof(URLSearchParams))
					.response(204),
			},
		};
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const body = new URLSearchParams([["title", "Write docs"]]);

		await client.forms.submit({ body });

		assert.equal(calls[0]?.init?.body, body);
		assert.deepEqual(calls[0]?.init?.headers, {});
	});

	it("sends form bodies as URLSearchParams without generated content type", async () => {
		const apiContract = {
			forms: {
				submit: route
					.post("/forms")
					.formBody(
						z.object({
							title: z.string(),
							remember: z.boolean().optional(),
						}),
					)
					.response(204),
			},
		};
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.forms.submit({
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

	it("preserves body fields in grouped form payloads", async () => {
		const apiContract = {
			forms: {
				submit: route
					.post("/forms")
					.formBody(
						z.object({
							body: z.string(),
							title: z.string(),
						}),
					)
					.response(204),
			},
		};
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.forms.submit({
			body: {
				body: "Article contents",
				title: "Write docs",
			},
		});

		assert.ok(calls[0]?.init?.body instanceof URLSearchParams);
		assert.equal(
			calls[0].init.body.toString(),
			"body=Article+contents&title=Write+docs",
		);
	});

	it("sends form arrays with empty-bracket field names", async () => {
		const apiContract = {
			forms: {
				submit: route
					.post("/forms")
					.formBody(
						z.object({
							title: z.string(),
							tags: z.array(z.string()),
						}),
					)
					.response(204),
			},
		};
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.forms.submit({
			body: {
				title: "Write docs",
				tags: ["ts", "rpc"],
			},
		});

		assert.ok(calls[0]?.init?.body instanceof URLSearchParams);
		assert.equal(
			calls[0].init.body.toString(),
			"title=Write+docs&tags%5B%5D=ts&tags%5B%5D=rpc",
		);
	});

	it("sends multipart bodies as FormData without generated content type", async () => {
		const apiContract = {
			uploads: {
				create: route
					.post("/uploads")
					.multipartBody(
						z.object({
							title: z.string(),
							file: z.instanceof(Blob),
							tags: z.array(z.string()).optional(),
						}),
					)
					.response(204),
			},
		};
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});
		const file = new Blob(["hello"], { type: "text/plain" });

		await client.uploads.create({
			body: {
				title: "Write docs",
				file,
				tags: ["ts", "rpc"],
			},
		});

		assert.ok(calls[0]?.init?.body instanceof FormData);
		assert.equal(calls[0].init.body.get("title"), "Write docs");
		assert.ok(calls[0].init.body.get("file") instanceof Blob);
		assert.deepEqual(calls[0].init.body.getAll("tags[]"), ["ts", "rpc"]);
		assert.deepEqual(calls[0]?.init?.headers, {});
	});

	it("preserves body fields in grouped multipart payloads", async () => {
		const apiContract = {
			uploads: {
				create: route
					.post("/uploads")
					.multipartBody(
						z.object({
							body: z.string(),
							title: z.string(),
						}),
					)
					.response(204),
			},
		};
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.uploads.create({
			body: {
				body: "File contents",
				title: "Upload docs",
			},
		});

		assert.ok(calls[0]?.init?.body instanceof FormData);
		assert.equal(calls[0].init.body.get("body"), "File contents");
		assert.equal(calls[0].init.body.get("title"), "Upload docs");
	});

	it("sends custom bodies with a selected declared content type", async () => {
		const apiContract = {
			uploads: {
				image: route
					.post("/uploads/:id/image")
					.params(
						z.object({
							id: z.string(),
						}),
					)
					.customBody({
						contentType: ["image/png", "image/jpeg"],
						schema: z.string(),
					})
					.response(204),
			},
		};
		const calls = captureFetch();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.uploads.image({
			body: {
				contentType: "image/jpeg",
				payload: "jpeg bytes",
			},
			params: { id: "file 1" },
		});

		assert.equal(calls[0]?.url, "https://api.test/uploads/file%201/image");
		assert.equal(calls[0]?.init?.body, "jpeg bytes");
		assert.deepEqual(calls[0]?.init?.headers, {
			"content-type": "image/jpeg",
		});
	});

	it("stringifies application/json custom bodies", async () => {
		const calls = captureFetch();
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
		});

		await client.uploads.json({
			body: { type: "created" },
		});

		assert.equal(calls[0]?.init?.body, '{"type":"created"}');
	});

	it("uses the second argument for options on routes without input", async () => {
		const apiContract = {
			ping: route.post("/ping").response(204),
		};
		const calls = captureFetch();
		const controller = new AbortController();
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
		});

		await client.ping(undefined, { signal: controller.signal });

		assert.equal(calls[0]?.url, "https://api.test/ping");
		assert.equal(calls[0]?.init?.body, undefined);
		assert.deepEqual(calls[0]?.init?.headers, {});
		assert.equal(calls[0]?.init?.signal, controller.signal);
	});

	it("merges global fetch options and per-call options", async () => {
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
			fetchOptions: {
				cache: "no-store",
				credentials: "include",
			},
			getGlobalHeaders: () => ({ Authorization: "Bearer token" }),
		});

		await client.todos.list(
			{ query: { search: "milk" } },
			{ credentials: "omit" },
		);

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
		const client = initClient(createRequestTestContract(), {
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

		await client.todos.list({ query: { search: "milk" } });
		await client.todos.create({ body: { title: "Buy milk" } });

		assert.deepEqual(calls[0]?.init?.next, {
			revalidate: 60,
			tags: [
				"manual",
				"api:todos.list:query:%7B%22search%22%3A%22milk%22%7D",
				"api:todos.list",
			],
		});
		assert.deepEqual(calls[1]?.init?.next, {
			revalidate: 60,
			tags: ["manual"],
		});
	});

	it("lets custom fetch inspect and replace the final request init", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const client = initClient(createRequestTestContract(), {
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

		await client.todos.list({ query: { search: "milk" } });

		assert.deepEqual(calls[0]?.init?.headers, {
			"x-custom-fetch": "true",
		});
	});

	it("normalizes merged headers and lets declared request headers win", async () => {
		const apiRoute = route.with({
			headers: z.object({
				"x-common": z.number(),
				"x-shared": z.number(),
			}),
		});
		const apiContract = {
			todos: {
				list: apiRoute
					.get("/todos")
					.query(z.object({ search: z.string() }))
					.headers(z.object({ "X-Route": z.string(), "x-shared": z.string() }))
					.response(
						200,
						z.array(z.object({ id: z.string(), title: z.string() })),
					),
			},
		};
		const calls = captureFetch(jsonResponse([]));
		const client = initClient(apiContract, {
			baseUrl: "https://api.test",
			getGlobalHeaders: () => ({
				"X-Global": "global",
				"X-Route": "from global",
				"X-Shared": "from global",
			}),
		});

		await client.todos.list({
			query: { search: "milk" },
			headers: {
				"x-common": 123,
				"X-Route": "route",
				"x-shared": "route shared",
			},
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
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
			getGlobalHeaders: () => ({
				"content-type": "text/plain",
			}),
		});

		await assert.rejects(
			() => client.todos.create({ body: { title: "created" } }),
			/getGlobalHeaders\(\) must not return a "content-type" header/,
		);
	});

	it("keeps duplicate property names in their declared HTTP segments", () => {
		const declaration = route
			.post("/items/:id")
			.params(z.object({ id: z.string() }))
			.query(z.object({ id: z.string() }))
			.body(z.object({ id: z.string(), context: z.string() }))
			.response(204);
		const request = constructBaseRequest("https://api.test", declaration, {
			params: { id: "path-id" },
			query: { id: "query-id" },
			body: { id: "body-id", context: "body-context" },
		});
		assert.equal(request.url, "https://api.test/items/path-id?id=query-id");
		assert.equal(
			request.body,
			JSON.stringify({ id: "body-id", context: "body-context" }),
		);
	});

	it("serializes falsy JSON body values", () => {
		const declaration = route
			.post("/values")
			.body(type<false | 0 | "" | null>())
			.response(204);
		for (const body of [false, 0, "", null]) {
			const request = constructBaseRequest("https://api.test", declaration, {
				body,
			});
			assert.equal(request.body, JSON.stringify(body));
			assert.equal(request.contentType, "application/json");
		}
	});

	it("serializes opaque schemas without request key metadata", async () => {
		const calls = captureFetch(new Response(null, { status: 204 }));
		const client = initClient(
			{
				opaque: route
					.post("/opaque")
					.body(type<{ title: string }>())
					.response(204),
			},
			{
				baseUrl: "https://api.test",
			},
		);
		await client.opaque({ body: { title: "created" } });
		assert.equal(calls[0]?.init?.body, JSON.stringify({ title: "created" }));
	});

	it("cleans up timeout signals after fetch failures", async () => {
		let abortEventCount = 0;
		globalThis.fetch = async (_url, init) => {
			init?.signal?.addEventListener("abort", () => {
				abortEventCount += 1;
			});
			throw new Error("network down");
		};
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
			timeoutMs: 5,
		});

		await assert.rejects(() =>
			client.todos.list({ query: { search: "milk" } }),
		);
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
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
			timeoutMs: 10_000,
			getGlobalHeaders: async () => {
				throw new Error("headers unavailable");
			},
		});

		await assert.rejects(
			() => client.todos.list({ query: { search: "milk" } }),
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
				{
					status: 200,
					headers: {
						"content-type": "application/json",
					},
				},
			);
		};
		const client = initClient(createRequestTestContract(), {
			baseUrl: "https://api.test",
			timeoutMs: 5,
		});

		await client.todos.list({ query: { search: "milk" } });

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
