import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERVER_FIRST_RESPONSE_KIND_HEADER } from "@rest-rpc/core/client";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { skipToken } from "@tanstack/query-core";
import { createTanstackQueryHelpers } from "./tanstackQueryHelpers.ts";

const jsonResponse = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			"content-type": "application/json",
			[SERVER_FIRST_RESPONSE_KIND_HEADER]: "v=1 kind=json",
		},
	});

type TestProcedureImplementation = {
	readonly "~restrpc": RouteDeclaration & {
		readonly kind: "procedure";
		readonly handler: () => unknown;
	};
};

describe("createTanstackQueryHelpers server-first mode", () => {
	it("creates method-and-path query helpers with grouped requests", async () => {
		const calls: Array<{ input: string; init?: RequestInit }> = [];
		const fetch = async (input: string | URL | Request, init?: RequestInit) => {
			calls.push({ input: String(input), init });
			return jsonResponse({ id: "todo-1", title: "Todo" });
		};
		const helpers = createTanstackQueryHelpers<unknown>({
			baseUrl: "https://example.test",
			fetch,
		}) as any;
		const request = { params: { id: "todo-1" } };
		const options = helpers
			.$get("/todos/:id")
			.queryOptions(request, { staleTime: 100 });

		assert.deepEqual(options.queryKey, ["get", "/todos/:id", request]);
		assert.equal(options.staleTime, 100);
		const response = await options.queryFn({});
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, { id: "todo-1", title: "Todo" });
		assert.ok(response.headers instanceof Headers);
		assert.equal(calls[0]?.input, "https://example.test/todos/todo-1");
	});

	it("uses positional options and supports disabled grouped requests", async () => {
		let callCount = 0;
		const helpers = createTanstackQueryHelpers<unknown>({
			baseUrl: "https://example.test",
			fetch: async () => {
				callCount += 1;
				return jsonResponse({ ok: true });
			},
		}) as any;
		const route = helpers.$get("/health");
		const active = route.queryOptions(undefined, { staleTime: 50 });

		assert.equal(active.staleTime, 50);
		assert.deepEqual(active.queryKey, ["get", "/health"]);
		await active.queryFn({});
		assert.equal(callCount, 1);

		const disabled = route.queryOptions(skipToken);
		assert.equal(disabled.queryFn, skipToken);
		assert.deepEqual(disabled.queryKey, ["get", "/health"]);
	});

	it("creates direct-data shorthand query, mutation, options, and key helpers", async () => {
		const calls: Array<{ input: string; init?: RequestInit }> = [];
		const helpers = createTanstackQueryHelpers<{
			todos: {
				get: TestProcedureImplementation;
				add: TestProcedureImplementation;
			};
		}>({
			baseUrl: "https://example.test",
			fetch: async (input, init) => {
				calls.push({ input: String(input), init });
				return jsonResponse({ id: "todo-1" });
			},
		}) as any;
		const getOptions = helpers.todos.get.queryOptions(undefined, {
			staleTime: 50,
		});
		const addOptions = helpers.todos.add.mutationOptions({ retry: false });

		assert.deepEqual(getOptions.queryKey, ["todos", "get"]);
		assert.equal(getOptions.staleTime, 50);
		assert.deepEqual(await getOptions.queryFn({}), { id: "todo-1" });
		assert.deepEqual(await addOptions.mutationFn({ title: "Todo" }), {
			id: "todo-1",
		});
		assert.deepEqual(helpers.todos.add.getKey({ title: "Todo" }), [
			"todos",
			"add",
			{ title: "Todo" },
		]);
		assert.equal(calls[0]?.input, "https://example.test/todos/get");
		assert.equal(calls[1]?.input, "https://example.test/todos/add");
		assert.equal(calls[1]?.init?.body, JSON.stringify({ title: "Todo" }));
	});

	it("distinguishes calls from traversal without reserving selector or helper names", async () => {
		const calls: string[] = [];
		const helpers = createTanstackQueryHelpers<unknown>({
			baseUrl: "https://example.test",
			fetch: async (input) => {
				calls.push(String(input));
				return jsonResponse({ id: "todo-1" });
			},
		}) as any;

		const explicit = helpers.$get("/todos").queryOptions();
		const selectorNamedRoute = helpers.get.queryOptions();
		const helperNamedRoute = helpers.todos.queryOptions.queryOptions();

		await explicit.queryFn({});
		await selectorNamedRoute.queryFn({});
		await helperNamedRoute.queryFn({});

		assert.deepEqual(calls, [
			"https://example.test/todos",
			"https://example.test/get",
			"https://example.test/todos/queryOptions",
		]);
	});
});
