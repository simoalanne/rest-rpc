import assert from "node:assert/strict";
import { describe, it } from "node:test";
import esmock from "esmock";
import { createQueryClientMock, resetQueryClientMock } from "./factories.ts";

const routeWithoutRequest = {
	method: "GET",
	path: "/items",
	responses: { 200: {} },
} as any;

const routeWithRequest = {
	method: "GET",
	path: "/items/:id",
	request: { params: {} },
	responses: { 200: {} },
} as any;

const getCreateRouteHooks = async (calls: {
	useQueryCalls: unknown[];
	useSuspenseQueryCalls: unknown[];
	useMutationCalls: unknown[];
}) => {
	const module = await esmock("./routeHooks.ts", {
		"@tanstack/react-query": {
			useQuery: ((options: unknown) => {
				calls.useQueryCalls.push(options);
				return { source: "useQuery", options };
			}) as any,
			useSuspenseQuery: ((options: unknown) => {
				calls.useSuspenseQueryCalls.push(options);
				return { source: "useSuspenseQuery", options };
			}) as any,
			useMutation: ((options: unknown) => {
				calls.useMutationCalls.push(options);
				return { source: "useMutation", options };
			}) as any,
		},
	});

	return module.createRouteHooks as typeof import("./routeHooks.ts").createRouteHooks;
};

describe("createRouteHooks", () => {
	it("configures useQuery with request-aware keys and fetchResponse", async () => {
		const calls = {
			useQueryCalls: [] as unknown[],
			useSuspenseQueryCalls: [] as unknown[],
			useMutationCalls: [] as unknown[],
		};
		const fetchResponseCalls: unknown[][] = [];
		const createRouteHooks = await getCreateRouteHooks(calls);
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);
		const hooks = createRouteHooks(
			routeWithRequest,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					declared: true,
					status: 200,
					body: { id: "item-1" },
				};
			},
			["items", "byId"],
			queryClient.queryClient as any,
		);
		const request = { id: "item-1" };

		const result = hooks.useQuery(request, { staleTime: 123 });

		assert.deepEqual(result, {
			source: "useQuery",
			options: calls.useQueryCalls[0],
		});
		const options = calls.useQueryCalls[0] as any;
		assert.deepEqual(options.queryKey, ["items", "byId", request]);
		assert.equal(options.enabled, true);
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

	it("forwards query fetch options to fetchResponse without passing them to React Query", async () => {
		const calls = {
			useQueryCalls: [] as unknown[],
			useSuspenseQueryCalls: [] as unknown[],
			useMutationCalls: [] as unknown[],
		};
		const fetchResponseCalls: unknown[][] = [];
		const createRouteHooks = await getCreateRouteHooks(calls);
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);
		const hooks = createRouteHooks(
			routeWithRequest,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					declared: true,
					status: 200,
					body: { id: "item-1" },
				};
			},
			["items", "byId"],
			queryClient.queryClient as any,
		);
		const request = { id: "item-1" };

		hooks.useQuery(request, {
			fetchOptions: { credentials: "include", cache: "no-store" },
			retry: false,
		});

		const options = calls.useQueryCalls[0] as any;
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

	it("disables request-based queries when request input is falsy", async () => {
		const calls = {
			useQueryCalls: [] as unknown[],
			useSuspenseQueryCalls: [] as unknown[],
			useMutationCalls: [] as unknown[],
		};
		const createRouteHooks = await getCreateRouteHooks(calls);
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);
		const hooks = createRouteHooks(
			routeWithRequest,
			async () => ({ declared: true, status: 200, body: {} }),
			["items", "byId"],
			queryClient.queryClient as any,
		);

		hooks.useQuery("");

		const options = calls.useQueryCalls[0] as any;
		assert.equal(options.enabled, false);
		assert.deepEqual(options.queryKey, ["items", "byId"]);
	});

	it("treats the first useQuery argument as options for routes without request input", async () => {
		const calls = {
			useQueryCalls: [] as unknown[],
			useSuspenseQueryCalls: [] as unknown[],
			useMutationCalls: [] as unknown[],
		};
		const fetchResponseCalls: unknown[][] = [];
		const createRouteHooks = await getCreateRouteHooks(calls);
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);
		const hooks = createRouteHooks(
			routeWithoutRequest,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					declared: true,
					status: 200,
					body: { items: [] },
				};
			},
			["items", "list"],
			queryClient.queryClient as any,
		);

		hooks.useQuery({ gcTime: 50 });

		const options = calls.useQueryCalls[0] as any;
		assert.equal(options.enabled, true);
		assert.equal(options.gcTime, 50);
		assert.equal(options.fetchOptions, undefined);
		assert.deepEqual(options.queryKey, ["items", "list"]);

		await options.queryFn({ signal: "list-signal" });
		assert.deepEqual(fetchResponseCalls, [[{ signal: "list-signal" }]]);
	});

	it("configures suspense queries and mutations", async () => {
		const calls = {
			useQueryCalls: [] as unknown[],
			useSuspenseQueryCalls: [] as unknown[],
			useMutationCalls: [] as unknown[],
		};
		const fetchResponseCalls: unknown[][] = [];
		const createRouteHooks = await getCreateRouteHooks(calls);
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);
		const hooks = createRouteHooks(
			routeWithRequest,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					declared: true,
					status: 201,
					body: { id: "item-2" },
				};
			},
			["items", "create"],
			queryClient.queryClient as any,
		);
		const request = { name: "Potato" };

		hooks.useSuspenseQuery(request, {
			retry: false,
			fetchOptions: { credentials: "omit" },
		});
		hooks.useMutation({ retry: false });

		const suspenseOptions = calls.useSuspenseQueryCalls[0] as any;
		assert.deepEqual(suspenseOptions.queryKey, ["items", "create", request]);
		assert.equal(suspenseOptions.retry, false);
		assert.equal(suspenseOptions.fetchOptions, undefined);
		await suspenseOptions.queryFn({ signal: "suspense-signal" });

		const mutationOptions = calls.useMutationCalls[0] as any;
		assert.equal(mutationOptions.retry, false);
		assert.deepEqual(await mutationOptions.mutationFn(request), {
			status: 201,
			body: { id: "item-2" },
		});
		assert.deepEqual(fetchResponseCalls, [
			[request, { credentials: "omit", signal: "suspense-signal" }],
			[request, undefined],
		]);
	});

	it("forwards useMutation fetch options to fetchResponse", async () => {
		const calls = {
			useQueryCalls: [] as unknown[],
			useSuspenseQueryCalls: [] as unknown[],
			useMutationCalls: [] as unknown[],
		};
		const fetchResponseCalls: unknown[][] = [];
		const createRouteHooks = await getCreateRouteHooks(calls);
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);
		const hooks = createRouteHooks(
			routeWithRequest,
			async (...args) => {
				fetchResponseCalls.push(args);
				return {
					declared: true,
					status: 201,
					body: { id: "item-2" },
				};
			},
			["items", "create"],
			queryClient.queryClient as any,
		);
		const request = { name: "Potato" };
		hooks.useMutation({
			fetchOptions: { credentials: "include", cache: "no-store" },
			retry: false,
		});
		const mutationOptions = calls.useMutationCalls[0] as any;

		assert.equal(mutationOptions.retry, false);
		assert.equal(mutationOptions.fetchOptions, undefined);
		await mutationOptions.mutationFn(request);

		assert.deepEqual(fetchResponseCalls, [
			[request, { credentials: "include", cache: "no-store" }],
		]);
	});

	it("exposes cache helpers that use contract key paths", async () => {
		const calls = {
			useQueryCalls: [] as unknown[],
			useSuspenseQueryCalls: [] as unknown[],
			useMutationCalls: [] as unknown[],
		};
		const createRouteHooks = await getCreateRouteHooks(calls);
		const queryClient = createQueryClientMock();
		resetQueryClientMock(queryClient);
		const request = { id: "item-4" };
		const updater = (current: unknown) => current;
		const hooks = createRouteHooks(
			routeWithRequest,
			async () => ({ declared: true, status: 200, body: {} }),
			["items", "byId"],
			queryClient.queryClient as any,
		);
		const listHooks = createRouteHooks(
			routeWithoutRequest,
			async () => ({ declared: true, status: 200, body: {} }),
			["items", "list"],
			queryClient.queryClient as any,
		);

		assert.deepEqual(hooks.getKey(request), ["items", "byId", request]);
		assert.deepEqual(listHooks.getKey(), ["items", "list"]);

		await hooks.invalidate(request);
		hooks.clear(request);
		hooks.setData(request, updater);
		listHooks.setData(updater);

		assert.deepEqual(queryClient.invalidateQueriesCalls, [
			[{ queryKey: ["items", "byId", request] }],
		]);
		assert.deepEqual(queryClient.cancelQueriesCalls, [
			[{ queryKey: ["items", "byId", request] }],
		]);
		assert.deepEqual(queryClient.removeQueriesCalls, [
			[{ queryKey: ["items", "byId", request] }],
		]);
		assert.deepEqual(queryClient.setQueryDataCalls, [
			[["items", "byId", request], updater],
		]);
		assert.deepEqual(queryClient.setQueriesDataCalls, [
			[{ queryKey: ["items", "list"] }, updater],
		]);
	});
});
