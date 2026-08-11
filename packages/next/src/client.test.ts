import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchLike } from "@rest-rpc/core";
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

const captureFetch = () => {
	const calls: FetchCall[] = [];

	const fetch: FetchLike = async (url, init) => {
		calls.push({ url: String(url), init });
		return new Response(null, { status: 204 });
	};

	return { calls, fetch };
};

const createTestContract = () =>
	router({
		todos: {
			list: {
				method: "GET",
				path: "/api/todos/:id",
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
				path: "/api/todos",
				responses: {
					204: noBody(),
				},
			},
		},
	});

describe("Next client", () => {
	it("adds automatic tags to GET fetches while preserving prepared Next options", async () => {
		const apiContract = createTestContract();
		const { calls, fetch } = captureFetch();
		const client = initNextClient(apiContract, {
			origin: "https://api.test",
			fetch,
			fetchOptions: {
				next: {
					revalidate: 60,
					tags: ["manual"],
				},
			},
			automaticFetchTags: {
				enabled: true,
				tagPrefix: "api",
			},
		});

		await client.todos.list.fetch({ id: "todo 1", filter: "open" });

		const init = calls[0]?.init as NextFetchInit | undefined;

		assert.equal(
			calls[0]?.url,
			"https://api.test/api/todos/todo%201?filter=open",
		);
		assert.deepEqual(init?.next, {
			revalidate: 60,
			tags: [
				"manual",
				"api:/api/todos/todo%201?filter=open",
				"api:/api/todos/todo%201",
			],
		});
	});

	it("does not tag non-GET fetches and still preserves prepared init", async () => {
		const apiContract = createTestContract();
		const { calls, fetch } = captureFetch();
		const client = initNextClient(apiContract, {
			origin: "https://api.test",
			fetch,
			fetchOptions: {
				next: {
					revalidate: 60,
					tags: ["manual"],
				},
			},
			automaticFetchTags: {
				enabled: true,
			},
		});

		await client.todos.create.fetch();

		const init = calls[0]?.init as NextFetchInit | undefined;

		assert.equal(calls[0]?.url, "https://api.test/api/todos");
		assert.deepEqual(init?.next, {
			revalidate: 60,
			tags: ["manual"],
		});
	});
});
