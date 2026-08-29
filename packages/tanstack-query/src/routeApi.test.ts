import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { skipToken } from "@tanstack/query-core";
import { createRouteApi } from "./routeApi.ts";

const routeWithoutRequest = {
	method: "GET",
	path: "/items",
	routePath: ["items", "list"],
	responses: { 200: {} },
} as any;

const routeWithRequest = {
	method: "GET",
	path: "/items/:id",
	routePath: ["items", "byId"],
	pathParams: {},
	responses: { 200: {} },
} as any;

describe("createRouteApi", () => {
	it("creates query options with request-aware keys and fetchResponse", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeApi = createRouteApi(routeWithRequest, async (...args) => {
			fetchResponseCalls.push(args);
			return {
				declared: true,
				status: 200,
				body: { id: "item-1" },
			};
		});
		const request = { id: "item-1" };

		const options = routeApi.queryOptions(request, { staleTime: 123 }) as any;

		assert.deepEqual(options.queryKey, ["items", "byId", request]);
		assert.equal(options.enabled, undefined);
		assert.equal(options.staleTime, 123);
		assert.equal(options.fetchOptions, undefined);
		assert.deepEqual(await options.queryFn({ signal: "signal-value" }), {
			status: 200,
			body: { id: "item-1" },
		});
		assert.deepEqual(fetchResponseCalls, [
			[request, { signal: "signal-value" }],
		]);
	});

	it("forwards query fetch options to fetchResponse without returning them", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeApi = createRouteApi(routeWithRequest, async (...args) => {
			fetchResponseCalls.push(args);
			return {
				declared: true,
				status: 200,
				body: { id: "item-1" },
			};
		});
		const request = { id: "item-1" };

		const options = routeApi.queryOptions(request, {
			fetchOptions: { credentials: "include", cache: "no-store" },
			retry: false,
		}) as any;

		assert.equal(options.retry, false);
		assert.equal(options.fetchOptions, undefined);
		await options.queryFn({ signal: "query-signal" });
		assert.deepEqual(fetchResponseCalls, [
			[
				request,
				{
					credentials: "include",
					cache: "no-store",
					signal: "query-signal",
				},
			],
		]);
	});

	it("allows query options to override generated query keys", () => {
		const routeApi = createRouteApi(routeWithRequest, async () => ({
			declared: true,
			status: 200,
			body: {},
		}));
		const request = { id: "item-1" };

		const options = routeApi.queryOptions(request, {
			queryKey: ["custom", request],
		});

		assert.deepEqual(options.queryKey, ["custom", request]);
		assert.deepEqual(routeApi.getKey(request), ["items", "byId", request]);
	});

	it("uses skipToken to disable request-based query options", () => {
		const routeApi = createRouteApi(routeWithRequest, async () => ({
			declared: true,
			status: 200,
			body: {},
		}));

		const options = routeApi.queryOptions(skipToken) as any;

		assert.equal(options.queryFn, skipToken);
		assert.deepEqual(options.queryKey, ["items", "byId"]);
	});

	it("uses conditional request input to disable request-based query options", () => {
		const routeApi = createRouteApi(routeWithRequest, async () => ({
			declared: true,
			status: 200,
			body: {},
		}));

		const optionalId = "";
		const options = routeApi.queryOptions(
			optionalId && { id: optionalId },
		) as any;

		assert.equal(options.queryFn, skipToken);
		assert.deepEqual(options.queryKey, ["items", "byId"]);
	});

	it("treats the first queryOptions argument as options for routes without request input", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeApi = createRouteApi(routeWithoutRequest, async (...args) => {
			fetchResponseCalls.push(args);
			return {
				declared: true,
				status: 200,
				body: { items: [] },
			};
		});

		const options = routeApi.queryOptions({ gcTime: 50 }) as any;

		assert.equal(options.enabled, undefined);
		assert.equal(options.gcTime, 50);
		assert.equal(options.fetchOptions, undefined);
		assert.deepEqual(options.queryKey, ["items", "list"]);
		assert.deepEqual(routeApi.getKey(), ["items", "list"]);
		await options.queryFn({ signal: "list-signal" });
		assert.deepEqual(fetchResponseCalls, [[{ signal: "list-signal" }]]);
	});

	it("creates mutation options", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeApi = createRouteApi(routeWithRequest, async (...args) => {
			fetchResponseCalls.push(args);
			return {
				declared: true,
				status: 201,
				body: { id: "item-2" },
			};
		});
		const request = { name: "Potato" };

		const options = routeApi.mutationOptions({
			fetchOptions: { credentials: "include", cache: "no-store" },
			retry: false,
		}) as any;

		assert.equal(options.retry, false);
		assert.equal(options.fetchOptions, undefined);
		assert.deepEqual(await options.mutationFn(request), {
			status: 201,
			body: { id: "item-2" },
		});
		assert.deepEqual(fetchResponseCalls, [
			[request, { credentials: "include", cache: "no-store" }],
		]);
	});

	it("creates infinite query options with route requests as page params", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeApi = createRouteApi(routeWithRequest, async (...args) => {
			fetchResponseCalls.push(args);
			return {
				declared: true,
				status: 200,
				body: { items: [], nextCursor: "cursor-2" },
			};
		});
		const initialRequest = { cursor: undefined, limit: 20 };
		const nextRequest = { cursor: "cursor-2", limit: 20 };

		const options = routeApi.infiniteQueryOptions({
			initialRequest,
			getNextRequest: () => nextRequest,
			fetchOptions: { credentials: "include" },
			staleTime: 123,
		}) as any;

		assert.deepEqual(options.queryKey, ["items", "byId"]);
		assert.deepEqual(options.initialPageParam, initialRequest);
		assert.equal(options.getNextPageParam(), nextRequest);
		assert.equal(options.fetchOptions, undefined);
		assert.equal(options.staleTime, 123);
		assert.deepEqual(
			await options.queryFn({
				pageParam: nextRequest,
				signal: "page-signal",
			}),
			{
				status: 200,
				body: { items: [], nextCursor: "cursor-2" },
			},
		);
		assert.deepEqual(fetchResponseCalls, [
			[nextRequest, { credentials: "include", signal: "page-signal" }],
		]);
	});

	it("allows custom infinite query keys", () => {
		const routeApi = createRouteApi(routeWithRequest, async () => ({
			declared: true,
			status: 200,
			body: {},
		}));

		const options = routeApi.infiniteQueryOptions({
			queryKey: ["custom", "items"],
			initialRequest: { limit: 20 },
			getNextRequest: () => undefined,
		}) as any;

		assert.deepEqual(options.queryKey, ["custom", "items"]);
	});

	it("omits undefined request fields in generated keys", () => {
		const routeApi = createRouteApi(routeWithRequest, async () => ({
			declared: true,
			status: 200,
			body: {},
		}));

		assert.deepEqual(routeApi.getKey({ id: "item-4", optional: undefined }), [
			"items",
			"byId",
			{ id: "item-4" },
		]);
	});
});
