// biome-ignore-all lint/suspicious/noExplicitAny: This should test behaviour not types

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import esmock from "esmock";

const createQueryClientMock = () => ({
	invalidateQueries: async (...args: unknown[]) => {
		invalidateQueriesCalls.push(args);
	},
	cancelQueries: (...args: unknown[]) => {
		cancelQueriesCalls.push(args);
	},
	removeQueries: (...args: unknown[]) => {
		removeQueriesCalls.push(args);
	},
	setQueryData: (...args: unknown[]) => {
		setQueryDataCalls.push(args);
	},
	setQueriesData: (...args: unknown[]) => {
		setQueriesDataCalls.push(args);
	},
});

let invalidateQueriesCalls: unknown[][] = [];
let cancelQueriesCalls: unknown[][] = [];
let removeQueriesCalls: unknown[][] = [];
let setQueryDataCalls: unknown[][] = [];
let setQueriesDataCalls: unknown[][] = [];
let useQueryCalls: unknown[] = [];
let useSuspenseQueryCalls: unknown[] = [];
let useMutationCalls: unknown[] = [];

let mutateCalls: unknown[][] = [];
let mutateAsyncCalls: unknown[][] = [];

const getCreateAdapter = async () => {
	const module = await esmock("./createAdapter.ts", {
		"@tanstack/react-query": {
			useQuery: ((options: unknown) => {
				useQueryCalls.push(options);
				return { source: "useQuery", options };
			}) as any,
			useSuspenseQuery: ((options: unknown) => {
				useSuspenseQueryCalls.push(options);
				return { source: "useSuspenseQuery", options };
			}) as any,
			useMutation: ((options: any) => {
				useMutationCalls.push(options);
				return {
					status: "idle",
					mutate: (...args: unknown[]) => {
						mutateCalls.push(args);
					},
					mutateAsync: async (...args: unknown[]) => {
						mutateAsyncCalls.push(args);
						return {
							ok: true,
							args,
						};
					},
				};
			}) as any,
		},
	});

	return module.default;
};

const createNode = (
	$contract: Record<string, unknown>,
	fetch: (...args: unknown[]) => Promise<unknown>,
) => ({
	$contract,
	fetch,
	tryFetch: async (...args: unknown[]) => {
		try {
			const data = await fetch(...args);
			return { success: true, data };
		} catch (error) {
			return { success: false, error };
		}
	},
});

const createApiTree = () =>
	({
		items: {
			list: createNode(
				{ method: "GET", path: "/items" },
				async (...args: unknown[]) => {
					listFetchCalls.push(args);
					return { items: ["carrot"] };
				},
			),
			byId: createNode(
				{
					method: "GET",
					path: "/items/:id",
					request: { params: { shape: { id: true } } },
				},
				async (...args: unknown[]) => {
					byIdFetchCalls.push(args);
					return { id: "item-1" };
				},
			),
			create: createNode(
				{
					method: "POST",
					path: "/items",
					request: { body: { shape: { name: true } } },
				},
				async (...args: unknown[]) => {
					createFetchCalls.push(args);
					return { created: true };
				},
			),
			refresh: createNode(
				{ method: "POST", path: "/items/refresh" },
				async (...args: unknown[]) => {
					refreshFetchCalls.push(args);
					return { refreshed: true };
				},
			),
			upload: createNode(
				{
					method: "POST",
					path: "/items/upload",
					options: { mode: "raw" },
				},
				async (...args: unknown[]) => {
					uploadFetchCalls.push(args);
					return { uploaded: true };
				},
			),
			failing: createNode(
				{ method: "GET", path: "/items/failing" },
				async (...args: unknown[]) => {
					failingFetchCalls.push(args);
					throw failingError;
				},
			),
			events: {
				$contract: {
					method: "GET",
					path: "/items/events",
					options: { mode: "stream" },
				},
				stream: async () => [],
				subscribe: () => () => {},
			},
			socket: {
				$contract: {
					method: "GET",
					path: "/items/socket",
					options: { mode: "websocket" },
				},
				connect: () => ({
					socket: {},
					send: () => {},
					subscribe: () => () => {},
					close: () => {},
				}),
			},
		},
	}) as any;

let listFetchCalls: unknown[][] = [];
let byIdFetchCalls: unknown[][] = [];
let createFetchCalls: unknown[][] = [];
let refreshFetchCalls: unknown[][] = [];
let uploadFetchCalls: unknown[][] = [];
let failingFetchCalls: unknown[][] = [];
const failingError = new Error("boom");

const resetState = () => {
	invalidateQueriesCalls = [];
	cancelQueriesCalls = [];
	removeQueriesCalls = [];
	setQueryDataCalls = [];
	setQueriesDataCalls = [];
	useQueryCalls = [];
	useSuspenseQueryCalls = [];
	useMutationCalls = [];
	mutateCalls = [];
	mutateAsyncCalls = [];
	listFetchCalls = [];
	byIdFetchCalls = [];
	createFetchCalls = [];
	refreshFetchCalls = [];
	uploadFetchCalls = [];
	failingFetchCalls = [];
};

describe("createAdapter", () => {
	it("should preserve the API tree shape and expose GET helpers", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);

		assert.equal(typeof wrapped.items.list.useQuery, "function");
		assert.equal(typeof wrapped.items.list.useSuspenseQuery, "function");
		assert.equal(typeof wrapped.items.list.$fetch, "function");
		assert.equal(typeof wrapped.items.list.$tryFetch, "function");
		assert.equal(typeof wrapped.items.list.$getKey, "function");
		assert.equal(typeof wrapped.items.list.$contract, "object");
		assert.equal(typeof wrapped.items.list.invalidate, "function");
		assert.equal(typeof wrapped.items.list.clear, "function");
		assert.equal(typeof wrapped.items.list.setData, "function");
		assert.equal("$reactQueryApi" in wrapped.items.list, false);
		assert.equal(typeof wrapped.items.upload.$fetch, "function");
		assert.equal(typeof wrapped.items.upload.$tryFetch, "function");
		assert.equal("useQuery" in wrapped.items.upload, false);
		assert.equal("useMutation" in wrapped.items.upload, false);
		assert.equal(wrapped.items.events.$contract.path, "/items/events");
		assert.equal(typeof wrapped.items.events.$stream, "function");
		assert.equal(typeof wrapped.items.events.$subscribe, "function");
		assert.equal("stream" in wrapped.items.events, false);
		assert.equal("subscribe" in wrapped.items.events, false);
		assert.equal(wrapped.items.socket.$contract.path, "/items/socket");
		assert.equal(typeof wrapped.items.socket.$connect, "function");
		assert.equal("connect" in wrapped.items.socket, false);
	});

	it("should configure useQuery with request-aware key, enabled flag and query function", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		const request = { id: "item-1" };
		const options = { staleTime: 1234 };
		const result = wrapped.items.byId.useQuery(request, options as any) as any;

		assert.equal(result.source, "useQuery");
		assert.equal(useQueryCalls.length, 1);

		const queryOptions = useQueryCalls[0] as any;
		assert.deepStrictEqual(queryOptions.queryKey, ["items", "byId", request]);
		assert.equal(queryOptions.enabled, true);
		assert.equal(queryOptions.staleTime, 1234);

		const queryResult = await queryOptions.queryFn({ signal: "signal-value" });
		assert.deepStrictEqual(queryResult, { id: "item-1" });
		assert.deepStrictEqual(byIdFetchCalls, [
			[request, { signal: "signal-value" }],
		]);
	});

	it("should not enable request-based queries when request is missing", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		wrapped.items.byId.useQuery(undefined as any);

		const queryOptions = useQueryCalls[0] as any;
		assert.equal(queryOptions.enabled, false);
		assert.deepStrictEqual(queryOptions.queryKey, ["items", "byId"]);
	});

	it("should treat first argument as options for GET contracts without request", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		wrapped.items.list.useQuery({ gcTime: 50 } as any);

		const queryOptions = useQueryCalls[0] as any;
		assert.equal(queryOptions.enabled, true);
		assert.equal(queryOptions.gcTime, 50);
		assert.deepStrictEqual(queryOptions.queryKey, ["items", "list"]);

		await queryOptions.queryFn({ signal: "list-signal" });
		assert.deepStrictEqual(listFetchCalls, [[{ signal: "list-signal" }]]);
	});

	it("should configure useSuspenseQuery with the same request forwarding behavior", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		const request = { id: "item-2" };
		wrapped.items.byId.useSuspenseQuery(request, { retry: false } as any);

		const suspenseOptions = useSuspenseQueryCalls[0] as any;
		assert.deepStrictEqual(suspenseOptions.queryKey, [
			"items",
			"byId",
			request,
		]);
		assert.equal(suspenseOptions.retry, false);

		await suspenseOptions.queryFn({ signal: "suspense-signal" });
		assert.deepStrictEqual(byIdFetchCalls, [
			[request, { signal: "suspense-signal" }],
		]);
	});

	it("should expose fetch helpers that forward request and fetch options correctly", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		const request = { id: "item-3" };
		const fetchOptions = { signal: "fetch-signal" };

		await wrapped.items.byId.$fetch(request as any, fetchOptions as any);
		await wrapped.items.list.$fetch(fetchOptions as any);

		assert.deepStrictEqual(byIdFetchCalls, [[request, fetchOptions]]);
		assert.deepStrictEqual(listFetchCalls, [[fetchOptions]]);
	});

	it("should treat raw contracts as fetch-only wrappers", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);

		await wrapped.items.upload.$fetch({ rawBody: "payload" } as any);

		assert.deepStrictEqual(uploadFetchCalls, [[{ rawBody: "payload" }, undefined]]);
		assert.equal(useMutationCalls.length, 0);
		assert.equal(useQueryCalls.length, 0);
	});

	it("should return success and failure results from tryFetch", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);

		const successResult = await wrapped.items.list.$tryFetch();
		const failureResult = await wrapped.items.failing.$tryFetch();

		assert.deepStrictEqual(successResult, {
			success: true,
			data: { items: ["carrot"] },
		});
		assert.deepStrictEqual(failureResult, {
			success: false,
			error: failingError,
		});
	});

	it("should expose cache helper methods that use the contract path as query key", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		const request = { id: "item-4" };
		const updater = (current: unknown) => current;

		assert.deepStrictEqual(wrapped.items.byId.$getKey(request as any), [
			"items",
			"byId",
			request,
		]);
		assert.deepStrictEqual(wrapped.items.list.$getKey(), ["items", "list"]);

		await wrapped.items.byId.invalidate(request as any);
		wrapped.items.byId.clear(request as any);
		wrapped.items.byId.setData(request as any, updater);
		wrapped.items.list.setData(updater);

		assert.deepStrictEqual(invalidateQueriesCalls, [
			[{ queryKey: ["items", "byId", request] }],
		]);
		assert.deepStrictEqual(cancelQueriesCalls, [
			[{ queryKey: ["items", "byId", request] }],
		]);
		assert.deepStrictEqual(removeQueriesCalls, [
			[{ queryKey: ["items", "byId", request] }],
		]);
		assert.deepStrictEqual(setQueryDataCalls, [
			[["items", "byId", request], updater],
		]);
		assert.deepStrictEqual(setQueriesDataCalls, [
			[{ queryKey: ["items", "list"] }, updater],
		]);
	});

	it("should wrap POST contracts with useMutation and forward mutate arguments", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		const mutation = wrapped.items.create.useMutation({
			retry: false,
		} as any) as any;
		const request = { name: "Potato" };
		const hookOptions = { onSuccess: () => {} };

		assert.equal(useMutationCalls.length, 1);
		const mutationOptions = useMutationCalls[0] as any;
		assert.equal(mutationOptions.retry, false);

		const mutationFnResult = await mutationOptions.mutationFn(request);
		assert.deepStrictEqual(mutationFnResult, { created: true });
		assert.deepStrictEqual(createFetchCalls, [[request, undefined]]);

		mutation.mutate(request as any, hookOptions as any);
		const mutateAsyncResult = await mutation.mutateAsync(
			request as any,
			hookOptions as any,
		);

		assert.deepStrictEqual(mutateCalls, [[request, hookOptions]]);
		assert.deepStrictEqual(mutateAsyncCalls, [[request, hookOptions]]);
		assert.deepStrictEqual(mutateAsyncResult, {
			ok: true,
			args: [request, hookOptions],
		});
	});

	it("should call mutation fetchers without variables for POST contracts that do not take a request", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);
		const mutation = wrapped.items.refresh.useMutation() as any;
		const mutationOptions = useMutationCalls[0] as any;
		const hookOptions = { onSuccess: () => {} };

		await mutationOptions.mutationFn("ignored-variable");
		mutation.mutate(hookOptions as any);
		await mutation.mutateAsync(hookOptions as any);

		assert.deepStrictEqual(refreshFetchCalls, [[undefined]]);
		assert.deepStrictEqual(mutateCalls, [[undefined, hookOptions]]);
		assert.equal(mutateAsyncCalls.length, 1);
		assert.equal(mutateAsyncCalls[0][0], undefined);
		assert.equal(mutateAsyncCalls[0][1], hookOptions);
	});

	it("should expose query and mutation helpers for every JSON contract", async () => {
		resetState();

		const createAdapter = await getCreateAdapter();
		const wrapped = createAdapter(
			createApiTree(),
			createQueryClientMock() as any,
		);

		assert.equal(typeof wrapped.items.list.useQuery, "function");
		assert.equal(typeof wrapped.items.list.useMutation, "function");
		assert.equal(typeof wrapped.items.create.useMutation, "function");
		assert.equal(typeof wrapped.items.create.useQuery, "function");
		assert.equal(typeof wrapped.items.create.invalidate, "function");
		assert.equal(typeof wrapped.items.create.setData, "function");
	});
});
