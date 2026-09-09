import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { skipToken } from "@tanstack/query-core";
import { createTanstackHelpersForRoute } from "./createHelperFunctions.ts";

const routeWithoutRequestPath = ["items", "list"];
const routeWithRequestPath = ["items", "byId"];

describe("createTanstackQueryRouteHelpers", () => {
	it("creates query options with request-aware keys and fetchResponse", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { id: "item-1" },
				};
			},
		);
		const request = { id: "item-1" };

		const options = routeHelpers.queryOptions(request, {
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

	it("forwards query fetch options to fetchResponse without returning them", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { id: "item-1" },
				};
			},
		);
		const request = { id: "item-1" };

		const options = routeHelpers.queryOptions(request, {
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
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async () => ({
				status: 200,
				body: {},
			}),
		);
		const request = { id: "item-1" };

		const options = routeHelpers.queryOptions(request, {
			queryKey: ["custom", request],
		});

		assert.deepEqual(options.queryKey, ["custom", request]);
		assert.deepEqual(routeHelpers.getKey(request), ["items", "byId", request]);
	});

	it("uses skipToken to disable request-based query options", () => {
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async () => ({
				status: 200,
				body: {},
			}),
		);

		const options = routeHelpers.queryOptions(skipToken) as any;

		assert.equal(options.queryFn, skipToken);
		assert.deepEqual(options.queryKey, ["items", "byId"]);
	});

	it("uses the second queryOptions argument for routes without request input", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithoutRequestPath,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { items: [] },
				};
			},
		);

		const options = routeHelpers.queryOptions(undefined, { gcTime: 50 }) as any;

		assert.equal(options.enabled, undefined);
		assert.equal(options.gcTime, 50);
		assert.equal(options.fetchOptions, undefined);
		assert.deepEqual(options.queryKey, ["items", "list"]);
		assert.deepEqual(routeHelpers.getKey(), ["items", "list"]);
		await options.queryFn({ signal: "list-signal" });
		assert.deepEqual(fetchResponseCalls, [
			[undefined, { signal: "list-signal" }],
		]);
	});

	it("creates mutation options", async () => {
		const fetchResponseCalls: unknown[][] = [];
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 201,
					body: { id: "item-2" },
				};
			},
		);
		const request = { name: "Potato" };

		const options = routeHelpers.mutationOptions({
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
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					status: 200,
					body: { items: [], nextCursor: "cursor-2" },
				};
			},
		);
		const initialRequest = { cursor: undefined, limit: 20 };
		const nextRequest = { cursor: "cursor-2", limit: 20 };

		const options = routeHelpers.infiniteQueryOptions({
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
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async () => ({
				status: 200,
				body: {},
			}),
		);

		const options = routeHelpers.infiniteQueryOptions({
			queryKey: ["custom", "items"],
			initialRequest: { limit: 20 },
			getNextRequest: () => undefined,
		}) as any;

		assert.deepEqual(options.queryKey, ["custom", "items"]);
	});

	it("omits undefined request fields in generated keys", () => {
		const routeHelpers = createTanstackHelpersForRoute(
			routeWithRequestPath,
			async () => ({
				status: 200,
				body: {},
			}),
		);

		assert.deepEqual(
			routeHelpers.getKey({ id: "item-4", optional: undefined }),
			["items", "byId", { id: "item-4" }],
		);
	});
});
