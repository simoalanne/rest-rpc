import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERVER_FIRST_RESPONSE_KIND_HEADER } from "@rest-rpc/core/client";
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
			.get("/todos/:id")
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
		const route = helpers.get("/health");
		const active = route.queryOptions(undefined, { staleTime: 50 });

		assert.equal(active.staleTime, 50);
		assert.deepEqual(active.queryKey, ["get", "/health"]);
		await active.queryFn({});
		assert.equal(callCount, 1);

		const disabled = route.queryOptions(skipToken);
		assert.equal(disabled.queryFn, skipToken);
		assert.deepEqual(disabled.queryKey, ["get", "/health"]);
	});
});
