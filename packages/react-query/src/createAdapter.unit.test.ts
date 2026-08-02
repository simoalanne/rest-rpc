// biome-ignore-all lint/suspicious/noExplicitAny: This should test behaviour not types

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import esmock from "esmock";

const contracts = {
	items: {
		list: {
			method: "GET",
			path: "/items",
			responses: { 200: {} },
		},
		byId: {
			method: "GET",
			path: "/items/:id",
			request: { params: { shape: { id: true } } },
			responses: { 200: {} },
		},
		create: {
			method: "POST",
			path: "/items",
			request: { body: { shape: { name: true } } },
			responses: { 201: {}, 409: {} },
		},
		failing: {
			method: "GET",
			path: "/items/failing",
			responses: { 200: {}, 409: {} },
		},
		socket: {
			method: "GET",
			path: "/items/socket",
			options: { mode: "websocket" },
			messages: {
				client: {},
				server: {},
			},
		},
	},
} as any;

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

let initClientCalls: unknown[][] = [];
let invalidateQueriesCalls: unknown[][] = [];
let cancelQueriesCalls: unknown[][] = [];
let removeQueriesCalls: unknown[][] = [];
let setQueryDataCalls: unknown[][] = [];
let setQueriesDataCalls: unknown[][] = [];
let useQueryCalls: unknown[] = [];
let useSuspenseQueryCalls: unknown[] = [];
let useMutationCalls: unknown[] = [];
let listFetchResponseCalls: unknown[][] = [];
let byIdFetchResponseCalls: unknown[][] = [];
let createFetchResponseCalls: unknown[][] = [];
let failingFetchResponseCalls: unknown[][] = [];

const resetState = () => {
	initClientCalls = [];
	invalidateQueriesCalls = [];
	cancelQueriesCalls = [];
	removeQueriesCalls = [];
	setQueryDataCalls = [];
	setQueriesDataCalls = [];
	useQueryCalls = [];
	useSuspenseQueryCalls = [];
	useMutationCalls = [];
	listFetchResponseCalls = [];
	byIdFetchResponseCalls = [];
	createFetchResponseCalls = [];
	failingFetchResponseCalls = [];
};

const createApiTree = () => ({
	items: {
		list: {
			fetchResponse: async (...args: unknown[]) => {
				listFetchResponseCalls.push(args);
				return {
					declared: true,
					status: 200,
					body: { items: ["carrot"] },
				};
			},
		},
		byId: {
			fetchResponse: async (...args: unknown[]) => {
				byIdFetchResponseCalls.push(args);
				return {
					declared: true,
					status: 200,
					body: { id: "item-1" },
				};
			},
		},
		create: {
			fetchResponse: async (...args: unknown[]) => {
				createFetchResponseCalls.push(args);
				return {
					declared: true,
					status: 201,
					body: { id: "item-2" },
				};
			},
		},
		failing: {
			fetchResponse: async (...args: unknown[]) => {
				failingFetchResponseCalls.push(args);
				return {
					declared: true,
					status: 409,
					body: { code: "ITEM_EXISTS" },
				};
			},
		},
		socket: {
			connect: () => ({}),
		},
	},
});

const getInitReactQueryClient = async () => {
	const module = await esmock("./createAdapter.ts", {
		"@contract-first-api/core": {
			initClient: (...args: unknown[]) => {
				initClientCalls.push(args);
				return createApiTree();
			},
		},
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
					mutate: () => {},
					mutateAsync: async () => undefined,
				};
			}) as any,
		},
	});

	return module.default;
};

describe("initReactQueryClient", () => {
	it("should create a core client and expose HTTP helpers", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const queryClient = createQueryClientMock();
		const api = initReactQueryClient(contracts, {
			queryClient,
			baseUrl: "http://localhost:3001/api",
			timeoutMs: 1000,
		} as any);

		assert.deepStrictEqual(initClientCalls, [
			[
				contracts,
				{
					baseUrl: "http://localhost:3001/api",
					timeoutMs: 1000,
				},
			],
		]);
		assert.equal(typeof api.items.list.useQuery, "function");
		assert.equal(typeof api.items.list.useSuspenseQuery, "function");
		assert.equal(typeof api.items.list.useMutation, "function");
		assert.equal(typeof api.items.list.invalidate, "function");
		assert.equal(typeof api.items.list.clear, "function");
		assert.equal(typeof api.items.list.setData, "function");
		assert.equal(typeof api.items.list.getKey, "function");
		assert.deepStrictEqual(api.items.socket, {});
	});

	it("should configure useQuery with request-aware keys and fetchResponse", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const api = initReactQueryClient(contracts, {
			queryClient: createQueryClientMock(),
			baseUrl: "http://localhost:3001/api",
		} as any);
		const request = { id: "item-1" };
		const result = api.items.byId.useQuery(request, {
			staleTime: 123,
		} as any) as any;

		assert.equal(result.source, "useQuery");
		assert.equal(useQueryCalls.length, 1);

		const queryOptions = useQueryCalls[0] as any;
		assert.deepStrictEqual(queryOptions.queryKey, ["items", "byId", request]);
		assert.equal(queryOptions.enabled, true);
		assert.equal(queryOptions.staleTime, 123);

		const queryResult = await queryOptions.queryFn({ signal: "signal-value" });
		assert.deepStrictEqual(queryResult, {
			status: 200,
			body: { id: "item-1" },
		});
		assert.deepStrictEqual(byIdFetchResponseCalls, [
			[request, { signal: "signal-value" }],
		]);
	});

	it("should disable request-based queries when request input is falsy", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const api = initReactQueryClient(contracts, {
			queryClient: createQueryClientMock(),
			baseUrl: "http://localhost:3001/api",
		} as any);

		api.items.byId.useQuery("" as any);

		const queryOptions = useQueryCalls[0] as any;
		assert.equal(queryOptions.enabled, false);
		assert.deepStrictEqual(queryOptions.queryKey, ["items", "byId"]);
	});

	it("should treat the first argument as options for contracts without request input", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const api = initReactQueryClient(contracts, {
			queryClient: createQueryClientMock(),
			baseUrl: "http://localhost:3001/api",
		} as any);

		api.items.list.useQuery({ gcTime: 50 } as any);

		const queryOptions = useQueryCalls[0] as any;
		assert.equal(queryOptions.enabled, true);
		assert.equal(queryOptions.gcTime, 50);
		assert.deepStrictEqual(queryOptions.queryKey, ["items", "list"]);

		await queryOptions.queryFn({ signal: "list-signal" });
		assert.deepStrictEqual(listFetchResponseCalls, [
			[{ signal: "list-signal" }],
		]);
	});

	it("should configure useSuspenseQuery with the same request forwarding behavior", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const api = initReactQueryClient(contracts, {
			queryClient: createQueryClientMock(),
			baseUrl: "http://localhost:3001/api",
		} as any);
		const request = { id: "item-2" };

		api.items.byId.useSuspenseQuery(request, { retry: false } as any);

		const suspenseOptions = useSuspenseQueryCalls[0] as any;
		assert.deepStrictEqual(suspenseOptions.queryKey, [
			"items",
			"byId",
			request,
		]);
		assert.equal(suspenseOptions.retry, false);

		await suspenseOptions.queryFn({ signal: "suspense-signal" });
		assert.deepStrictEqual(byIdFetchResponseCalls, [
			[request, { signal: "suspense-signal" }],
		]);
	});

	it("should configure mutations with response envelopes", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const api = initReactQueryClient(contracts, {
			queryClient: createQueryClientMock(),
			baseUrl: "http://localhost:3001/api",
		} as any);

		api.items.create.useMutation({ retry: false } as any);

		const mutationOptions = useMutationCalls[0] as any;
		assert.equal(mutationOptions.retry, false);

		const request = { name: "Potato" };
		const result = await mutationOptions.mutationFn(request);
		assert.deepStrictEqual(result, {
			status: 201,
			body: { id: "item-2" },
		});
		assert.deepStrictEqual(createFetchResponseCalls, [[request, undefined]]);
	});

	it("should throw declared non-success responses as hook errors", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const api = initReactQueryClient(contracts, {
			queryClient: createQueryClientMock(),
			baseUrl: "http://localhost:3001/api",
		} as any);

		api.items.failing.useQuery();

		const queryOptions = useQueryCalls[0] as any;
		await assert.rejects(
			() => queryOptions.queryFn({ signal: "failing-signal" }),
			{
				status: 409,
				body: { code: "ITEM_EXISTS" },
			},
		);
		assert.deepStrictEqual(failingFetchResponseCalls, [
			[{ signal: "failing-signal" }],
		]);
	});

	it("should expose cache helpers that use contract path keys", async () => {
		resetState();

		const initReactQueryClient = await getInitReactQueryClient();
		const api = initReactQueryClient(contracts, {
			queryClient: createQueryClientMock(),
			baseUrl: "http://localhost:3001/api",
		} as any);
		const request = { id: "item-4" };
		const updater = (current: unknown) => current;

		assert.deepStrictEqual(api.items.byId.getKey(request as any), [
			"items",
			"byId",
			request,
		]);
		assert.deepStrictEqual(api.items.list.getKey(), ["items", "list"]);

		await api.items.byId.invalidate(request as any);
		api.items.byId.clear(request as any);
		api.items.byId.setData(request as any, updater);
		api.items.list.setData(updater);

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
});
