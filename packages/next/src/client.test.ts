import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { noBody, router, type } from "@rest-rpc/core";
import { initNextClient } from "./client.ts";

type FetchCall = {
	url: string;
	init?: RequestInit;
};

type NextFetchInit = RequestInit & {
	next?: {
		tags?: string[];
		revalidate?: number;
	};
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const captureFetch = () => {
	const calls: FetchCall[] = [];

	globalThis.fetch = async (url, init) => {
		calls.push({ url: String(url), init });
		return new Response(null, { status: 204 });
	};

	return calls;
};

const createTestContract = () =>
	router({
		todos: {
			list: {
				method: "GET",
				path: "/todos/:id",
				request: {
					params: { id: type<string>() },
					query: { filter: type<string>() },
					requestKeys: {
						id: "params",
						filter: "query",
					},
				},
				responses: {
					204: noBody(),
				},
			},
			create: {
				method: "POST",
				path: "/todos",
				responses: {
					204: noBody(),
				},
			},
		},
	});

describe("Next client", () => {
	it("adds automatic tags to GET fetches while preserving prepared Next options", async () => {
		const apiContract = createTestContract();
		const calls = captureFetch();
		const client = initNextClient(apiContract, {
			baseUrl: "https://api.test",
			automaticFetchTags: {
				enabled: true,
				tagPrefix: "api",
			},
			prepareFetch: ({ init }) => ({
				...init,
				headers: {
					...init.headers,
					"x-request-id": "request-1",
				},
				next: {
					revalidate: 60,
					tags: ["manual"],
				},
			}),
		});

		await client.todos.list.fetch({ id: "todo 1", filter: "open" });

		const init = calls[0]?.init as NextFetchInit | undefined;

		assert.equal(calls[0]?.url, "https://api.test/todos/todo%201?filter=open");
		assert.deepEqual(init?.headers, {
			"x-request-id": "request-1",
		});
		assert.deepEqual(init?.next, {
			revalidate: 60,
			tags: [
				"manual",
				"api:/todos/todo%201?filter=open",
				"api:/todos/todo%201",
			],
		});
	});

	it("does not tag non-GET fetches and still preserves prepared init", async () => {
		const apiContract = createTestContract();
		const calls = captureFetch();
		const client = initNextClient(apiContract, {
			baseUrl: "https://api.test",
			automaticFetchTags: {
				enabled: true,
			},
			prepareFetch: ({ init }) => ({
				...init,
				headers: {
					...init.headers,
					"x-request-id": "request-1",
				},
				next: {
					revalidate: 60,
					tags: ["manual"],
				},
			}),
		});

		await client.todos.create.fetch();

		const init = calls[0]?.init as NextFetchInit | undefined;

		assert.equal(calls[0]?.url, "https://api.test/todos");
		assert.deepEqual(init?.headers, {
			"x-request-id": "request-1",
		});
		assert.deepEqual(init?.next, {
			revalidate: 60,
			tags: ["manual"],
		});
	});
});
