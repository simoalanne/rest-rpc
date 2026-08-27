import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
	InfiniteQueryObserver,
	MutationObserver,
	QueryClient,
	QueryObserver,
	skipToken,
	experimental_streamedQuery as streamedQuery,
} from "@tanstack/query-core";
import {
	createTanstackQueryClient,
	createTrackedFetch,
	type TrackedFetchCall,
} from "./client.ts";
import {
	type StartedTanstackQueryServer,
	startTanstackQueryServer,
} from "./server.ts";

type FetchResponseBody = {
	status: number;
	body: unknown;
};

const createQueryClient = () =>
	new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

const readJsonBody = async (call: TrackedFetchCall) => {
	const body = call.init?.body;
	if (typeof body !== "string") {
		throw new Error(
			"Expected tracked fetch call to include a JSON string body",
		);
	}
	return JSON.parse(body);
};

const readHeader = (call: TrackedFetchCall, name: string) =>
	new Headers(call.init?.headers).get(name);

const getTrackedCall = (calls: TrackedFetchCall[], index: number) => {
	const call = calls[index];
	if (call === undefined) {
		throw new Error(`Expected tracked fetch call at index ${index}`);
	}

	return call;
};

const waitForCall = async (calls: TrackedFetchCall[], count: number) => {
	const startedAt = Date.now();

	while (calls.length < count) {
		if (Date.now() - startedAt > 1_000) {
			throw new Error(`Timed out waiting for ${count} fetch call(s)`);
		}

		await new Promise((resolve) => setTimeout(resolve, 5));
	}
};

const assertEnvelope = (value: unknown, expected: FetchResponseBody) => {
	assert.equal(typeof value, "object");
	assert.notEqual(value, null);
	assert.deepEqual(
		{
			status: (value as FetchResponseBody).status,
			body: (value as FetchResponseBody).body,
		},
		expected,
	);
	assert.ok((value as { headers?: unknown }).headers instanceof Headers);
};

const collectAsyncIterable = async <T>(iterable: AsyncIterable<T>) => {
	const items: T[] = [];
	for await (const item of iterable) items.push(item);
	return items;
};

describe("fetch TanStack Query integration", () => {
	let server: StartedTanstackQueryServer;

	beforeEach(async () => {
		server = await startTanstackQueryServer();
	});

	afterEach(async () => {
		await server.close();
	});

	it("fetches query options through QueryClient and returns success envelopes", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();

		const response = await queryClient.fetchQuery(
			tq.projects.get.queryOptions({ id: "project-1" }),
		);

		assertEnvelope(response, {
			status: 200,
			body: { id: "project-1", name: "Apollo", status: "active" },
		});
		assert.equal(tracked.calls.length, 1);
		assert.match(tracked.calls[0]?.url ?? "", /\/projects\/project-1$/);
	});

	it("reuses fresh cache entries for the same generated query key", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const options = tq.projects.get.queryOptions(
			{ id: "project-1" },
			{ staleTime: Infinity },
		);

		await queryClient.fetchQuery(options);
		await queryClient.fetchQuery(options);
		await queryClient.fetchQuery(
			tq.projects.get.queryOptions(
				{ id: "project-2" },
				{ staleTime: Infinity },
			),
		);

		assert.equal(tracked.calls.length, 2);
		assert.match(tracked.calls[0]?.url ?? "", /\/projects\/project-1$/);
		assert.match(tracked.calls[1]?.url ?? "", /\/projects\/project-2$/);
	});

	it("uses query options as the first argument for routes without request input", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();

		const response = await queryClient.fetchQuery(
			tq.projects.list.queryOptions({ staleTime: Infinity }),
		);

		assert.equal(response.status, 200);
		assert.deepEqual(tq.projects.list.getKey(), ["projects", "list"]);
		assert.equal(tracked.calls.length, 1);
		assert.match(tracked.calls[0]?.url ?? "", /\/projects$/);
	});

	it("runs mutations through MutationObserver", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const observer = new MutationObserver(
			queryClient,
			tq.projects.create.mutationOptions(),
		);

		const response = await observer.mutate({
			name: "Equinox",
			status: "active",
		});

		assertEnvelope(response, {
			status: 201,
			body: {
				id: "project-5",
				name: "Equinox",
				status: "active",
			},
		});
		assert.equal(tracked.calls.length, 1);
		assert.equal(tracked.calls[0]?.init?.method, "POST");
		assert.deepEqual(await readJsonBody(getTrackedCall(tracked.calls, 0)), {
			name: "Equinox",
			status: "active",
		});
	});

	it("invalidates generated keys after mutations and refetches fresh data", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const listOptions = tq.projects.list.queryOptions({ staleTime: Infinity });

		const beforeCreate = await queryClient.fetchQuery(listOptions);
		const createObserver = new MutationObserver(
			queryClient,
			tq.projects.create.mutationOptions(),
		);
		await createObserver.mutate({ name: "Fathom" });
		await queryClient.invalidateQueries({
			queryKey: tq.projects.list.getKey(),
		});
		const afterCreate = await queryClient.fetchQuery(listOptions);

		assert.equal(tracked.calls.length, 3);
		assert.notDeepEqual(beforeCreate.body, afterCreate.body);
		assert.match(JSON.stringify(afterCreate.body), /"name":"Fathom"/);
	});

	it("stores and reuses data under custom query keys", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const options = tq.projects.search.queryOptions(
			{ q: "ap" },
			{
				queryKey: ["custom", "project-search", "ap"],
				staleTime: Infinity,
			},
		);

		await queryClient.fetchQuery(options);
		await queryClient.fetchQuery(options);

		assert.equal(tracked.calls.length, 1);
		assert.notEqual(
			queryClient.getQueryData(["custom", "project-search", "ap"]),
			undefined,
		);
		assert.equal(
			queryClient.getQueryData(tq.projects.search.getKey({ q: "ap" })),
			undefined,
		);
	});

	it("fetches multiple pages with infinite query options", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const observer = new InfiniteQueryObserver(
			queryClient,
			tq.projects.page.infiniteQueryOptions({
				initialRequest: { limit: 2 },
				getNextRequest: (lastPage) =>
					lastPage.body.nextCursor
						? { cursor: lastPage.body.nextCursor, limit: 2 }
						: undefined,
			}),
		);

		await observer.refetch();
		await observer.fetchNextPage();
		const result = observer.getCurrentResult();

		assert.equal(tracked.calls.length, 2);
		assert.match(tracked.calls[0]?.url ?? "", /\/project-page\?limit=2$/);
		assert.match(
			tracked.calls[1]?.url ?? "",
			/\/project-page\?cursor=2&limit=2$/,
		);
		assert.deepEqual(result.data?.pageParams, [
			{ limit: 2 },
			{ cursor: "2", limit: 2 },
		]);
		assert.equal(result.data?.pages.length, 2);
	});

	it("does not call fetch for skipToken query observers", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const observer = new QueryObserver(
			queryClient,
			tq.projects.get.queryOptions(skipToken),
		);

		const unsubscribe = observer.subscribe(() => {});
		await new Promise((resolve) => setTimeout(resolve, 25));
		unsubscribe();

		assert.equal(tracked.calls.length, 0);
		assert.deepEqual(observer.options.queryKey, ["projects", "get"]);
	});

	it("does not call fetch for falsy conditional request query observers", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const selectedId = "";
		const observer = new QueryObserver(
			queryClient,
			tq.projects.get.queryOptions(selectedId && { id: selectedId }),
		);

		const unsubscribe = observer.subscribe(() => {});
		await new Promise((resolve) => setTimeout(resolve, 25));
		unsubscribe();

		assert.equal(tracked.calls.length, 0);
		assert.deepEqual(observer.options.queryKey, ["projects", "get"]);
	});

	it("rejects declared query errors without retrying", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();

		await assert.rejects(
			() =>
				queryClient.fetchQuery(
					tq.projects.get.queryOptions({ id: "missing" }, { retry: false }),
				),
			{
				status: 404,
				body: { code: "not_found", id: "missing" },
			},
		);
		assert.equal(tracked.calls.length, 1);
	});

	it("rejects declared mutation errors without retrying", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const observer = new MutationObserver(
			queryClient,
			tq.projects.rename.mutationOptions({ retry: false }),
		);

		await assert.rejects(
			() => observer.mutate({ id: "project-1", name: "Borealis" }),
			{
				status: 409,
				body: { code: "name_conflict", name: "Borealis" },
			},
		);
		assert.equal(tracked.calls.length, 1);
		assert.equal(tracked.calls[0]?.init?.method, "PATCH");
	});

	it("forwards fetchOptions to fetch without exposing them as query options", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const options = tq.projects.create.mutationOptions({
			fetchOptions: {
				cache: "no-store",
			},
		});
		const observer = new MutationObserver(queryClient, options);

		const response = await observer.mutate({ name: "Grove" });

		assert.equal("fetchOptions" in options, false);
		assert.equal(tracked.calls[0]?.init?.cache, "no-store");
		assert.equal(
			readHeader(getTrackedCall(tracked.calls, 0), "content-type"),
			"application/json",
		);
		assertEnvelope(response, {
			status: 201,
			body: {
				id: "project-5",
				name: "Grove",
				status: "active",
			},
		});
	});

	it("omits undefined request fields from generated query keys and cache entries", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();

		await queryClient.fetchQuery(
			tq.projects.search.queryOptions(
				{ q: "ap", status: undefined },
				{ staleTime: Infinity },
			),
		);
		await queryClient.fetchQuery(
			tq.projects.search.queryOptions({ q: "ap" }, { staleTime: Infinity }),
		);

		assert.deepEqual(
			tq.projects.search.getKey({ q: "ap", status: undefined }),
			tq.projects.search.getKey({ q: "ap" }),
		);
		assert.equal(tracked.calls.length, 1);
	});

	it("passes TanStack cancellation signals to fetch", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();
		const options = tq.projects.slow.queryOptions({ id: "project-1" });

		const promise = queryClient.fetchQuery(options);
		await waitForCall(tracked.calls, 1);
		await queryClient.cancelQueries({ queryKey: options.queryKey });

		await assert.rejects(() => promise);
		assert.equal(tracked.calls.length, 1);
		assert.equal(tracked.calls[0]?.signal?.aborted, true);
	});

	it("returns stream route bodies as raw async iterables from regular query options", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();

		const response = await queryClient.fetchQuery(
			tq.projects.events.queryOptions(),
		);

		assert.equal(response.status, 200);
		assert.equal(typeof response.body[Symbol.asyncIterator], "function");
		assert.deepEqual(await collectAsyncIterable(response.body), [
			{ id: "project-1", event: "created" },
			{ id: "project-1", event: "renamed" },
		]);
		assert.strictEqual(
			queryClient.getQueryData(tq.projects.events.getKey()),
			response,
		);
		assert.equal(tracked.calls.length, 1);
	});

	it("can materialize rest-rpc stream route bodies with TanStack streamedQuery", async () => {
		const tracked = createTrackedFetch();
		const tq = createTanstackQueryClient(server.origin, tracked.fetch);
		const queryClient = createQueryClient();

		const response = await queryClient.fetchQuery({
			queryKey: ["projects", "events", "streamed-query"],
			queryFn: streamedQuery({
				streamFn: async () => {
					const response = await queryClient.fetchQuery(
						tq.projects.events.queryOptions(),
					);
					return response.body;
				},
			}),
		});

		assert.deepEqual(response, [
			{ id: "project-1", event: "created" },
			{ id: "project-1", event: "renamed" },
		]);
		assert.deepEqual(
			queryClient.getQueryData(["projects", "events", "streamed-query"]),
			response,
		);
		assert.equal(tracked.calls.length, 1);
	});
});
