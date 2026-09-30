import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { skipToken } from "@tanstack/query-core";
import { createTanstackHelpersForRoute } from "./createHelperFunctions.ts";

const routeWithoutRequestPath = ["items", "list"];
const routeWithRequestPath = ["items", "byId"];

describe("createTanstackQueryRouteHelpers", () => {
	it("creates query options with request-aware keys and a route call", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { id: "item-1" },
				};
			},
		});
		const request = { id: "item-1" };

		const options = routeHelpers.queryOptions({
			request,
			staleTime: 123,
		}) as any;

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

	it("forwards query fetch options to the route call without returning them", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { id: "item-1" },
				};
			},
		});
		const request = { id: "item-1" };

		const options = routeHelpers.queryOptions({
			request,
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
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async () => ({
				status: 200,
				body: {},
			}),
		});
		const request = { id: "item-1" };

		const options = routeHelpers.queryOptions({
			request,
			queryKey: ["custom", request],
		});

		assert.deepEqual(options.queryKey, ["custom", request]);
		assert.deepEqual(routeHelpers.queryKey(request), [
			"items",
			"byId",
			request,
		]);
	});

	it("uses skipToken to disable request-based query options", () => {
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async () => ({
				status: 200,
				body: {},
			}),
		});

		const options = routeHelpers.queryOptions({ request: skipToken }) as any;

		assert.equal(options.queryFn, skipToken);
		assert.deepEqual(options.queryKey, ["items", "byId"]);
	});

	it("creates query options for routes without request input", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithoutRequestPath,
			fetchData: async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { items: [] },
				};
			},
		});

		const options = routeHelpers.queryOptions({ gcTime: 50 }) as any;

		assert.equal(options.enabled, undefined);
		assert.equal(options.gcTime, 50);
		assert.equal(options.fetchOptions, undefined);
		assert.deepEqual(options.queryKey, ["items", "list"]);
		assert.deepEqual(routeHelpers.queryKey(), ["items", "list"]);
		await options.queryFn({ signal: "list-signal" });
		assert.deepEqual(fetchResponseCalls, [
			[undefined, { signal: "list-signal" }],
		]);
	});

	it("creates mutation options", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 201,
					body: { id: "item-2" },
				};
			},
		});
		const request = { name: "Potato" };

		const options = routeHelpers.mutationOptions({
			fetchOptions: { credentials: "include", cache: "no-store" },
			retry: false,
		}) as any;

		assert.equal(options.retry, false);
		assert.equal(options.fetchOptions, undefined);
		assert.deepEqual(options.mutationKey, ["items", "byId"]);
		assert.deepEqual(routeHelpers.mutationKey(), ["items", "byId"]);
		assert.deepEqual(await options.mutationFn(request), {
			status: 201,
			body: { id: "item-2" },
		});
		assert.deepEqual(fetchResponseCalls, [
			[request, { credentials: "include", cache: "no-store" }],
		]);
	});

	it("allows mutation options to override generated mutation keys", () => {
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async () => ({
				status: 201,
				body: {},
			}),
		});

		const options = routeHelpers.mutationOptions({
			mutationKey: ["custom", "create"],
		});

		assert.deepEqual(options.mutationKey, ["custom", "create"]);
		assert.deepEqual(routeHelpers.mutationKey(), ["items", "byId"]);
	});

	it("creates route requests from infinite query page params", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { items: [], nextCursor: "cursor-2" },
				};
			},
		});
		const initialPageParam: string | undefined = undefined;
		const nextPageParam = "cursor-2";

		const options = routeHelpers.infiniteQueryOptions({
			request: (cursor: string | undefined) => ({ cursor, limit: 20 }),
			initialPageParam,
			getNextPageParam: () => nextPageParam,
			fetchOptions: { credentials: "include" },
			staleTime: 123,
		}) as any;

		assert.deepEqual(options.queryKey, ["items", "byId"]);
		assert.deepEqual(options.initialPageParam, initialPageParam);
		assert.equal(options.getNextPageParam(), nextPageParam);
		assert.equal(options.fetchOptions, undefined);
		assert.equal(options.staleTime, 123);
		assert.deepEqual(
			await options.queryFn({
				pageParam: nextPageParam,
				signal: "page-signal",
			}),
			{
				status: 200,
				body: { items: [], nextCursor: "cursor-2" },
			},
		);
		assert.deepEqual(fetchResponseCalls, [
			[
				{ cursor: nextPageParam, limit: 20 },
				{ credentials: "include", signal: "page-signal" },
			],
		]);
	});

	it("uses skipToken to disable infinite query options", () => {
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async () => ({ status: 200, body: { items: [] } }),
		});

		const options = routeHelpers.infiniteQueryOptions({
			request: skipToken,
			initialPageParam: undefined,
			getNextPageParam: () => undefined,
		}) as any;

		assert.equal(options.queryFn, skipToken);
		assert.equal(options.initialPageParam, undefined);
		assert.deepEqual(options.queryKey, ["items", "byId"]);
	});

	it("allows custom infinite query keys", () => {
		const routeHelpers = createTanstackHelpersForRoute({
			routePath: routeWithRequestPath,
			fetchData: async () => ({
				status: 200,
				body: {},
			}),
		});

		const options = routeHelpers.infiniteQueryOptions({
			queryKey: ["custom", "items"],
			request: (page: { limit: number }) => page,
			initialPageParam: { limit: 20 },
			getNextPageParam: () => undefined,
		}) as any;

		assert.deepEqual(options.queryKey, ["custom", "items"]);
	});
});
