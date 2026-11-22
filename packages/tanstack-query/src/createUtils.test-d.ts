import {
	createClient,
	isDefinedError,
	route,
	routeError,
	sse,
	type,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
	type SseEvent,
} from "@rest-rpc/core";
import {
	QueryClient,
	skipToken,
	type InfiniteData,
	type QueryFunction,
	type QueryKey,
} from "@tanstack/query-core";
import { createTanstackQueryUtils } from "./index.ts";

const get = route
	.get("/users/:id")
	.params(type<{ id: string }>())
	.response(type<{ name: string }>())
	.error(
		routeError("NOT_FOUND", { status: 404, data: type<{ id: string }>() }),
	);
const empty = route.get("/health").response({ status: 204 });
const events = route.get("/events").response(sse(type<{ value: number }>()));
type GetResponse = InferClientResponse<typeof get>;
const queryUtils = createTanstackQueryUtils(
	createClient({ get, empty, events }, { origin: "https://example.test" }),
);

describe("createTanstackQueryUtils types", () => {
	it("preserves mutation variables, successful results, and defined errors", () => {
		const options = queryUtils.get.mutationOptions({
			onSuccess: (data, variables) => {
				expectTypeOf(data).toEqualTypeOf<InferClientResponse<typeof get>>();
				expectTypeOf(variables).toEqualTypeOf<{ params: { id: string } }>();
			},
			onError: (error) => {
				expectTypeOf(error).toEqualTypeOf<
					InferClientError<typeof get> | Error
				>();
				if (isDefinedError(error) && error.code === "NOT_FOUND") {
					expectTypeOf(error.data).toEqualTypeOf<{ id: string }>();
				}
			},
		});
		expectTypeOf<
			Parameters<NonNullable<typeof options.mutationFn>>[0]
		>().toEqualTypeOf<{ params: { id: string } }>();
		expectTypeOf<
			Awaited<ReturnType<NonNullable<typeof options.mutationFn>>>
		>().toEqualTypeOf<InferClientResponse<typeof get>>();
	});

	it("uses guaranteed global headers in query requests and mutation variables", () => {
		const secured = route
			.get("/")
			.headers(type<{ token: string; optional?: string }>())
			.response(type<string>());
		const securedUtils = createTanstackQueryUtils(
			createClient(secured, {
				globalHeaders: { token: async () => "token" },
			}),
		);
		securedUtils.queryOptions({ request: {} });
		expectTypeOf<
			Parameters<
				NonNullable<
					ReturnType<typeof securedUtils.mutationOptions>["mutationFn"]
				>
			>[0]
		>().toEqualTypeOf<
			{ headers?: { token?: string; optional?: string } } | undefined
		>();
		securedUtils.queryOptions();
		const uncertainUtils = createTanstackQueryUtils(
			createClient(secured, {
				globalHeaders: { token: (): string | undefined => undefined },
			}),
		);
		// @ts-expect-error An optional provider does not satisfy the token requirement.
		uncertainUtils.queryOptions({ request: {} });
	});

	it("tags infinite query caches with pages and page parameters", () => {
		const options = queryUtils.get.infiniteQueryOptions({
			initialPageParam: 0,
			request: (page) => ({ params: { id: String(page) } }),
			getNextPageParam: () => undefined,
			select: (data) => {
				expectTypeOf(data.pages).toEqualTypeOf<
					Array<InferClientResponse<typeof get>>
				>();
				expectTypeOf(data.pageParams).toEqualTypeOf<number[]>();
				return data.pages.map((page) => page.body.name);
			},
		});
		expectTypeOf(
			new QueryClient().getQueryData(options.queryKey),
		).toEqualTypeOf<
			InfiniteData<InferClientResponse<typeof get>, number> | undefined
		>();
		type PageQueryFn = QueryFunction<GetResponse, QueryKey, number>;
		expectTypeOf(options.queryFn).toExtend<PageQueryFn>();
		const skipped = queryUtils.get.infiniteQueryOptions({
			initialPageParam: 0,
			request: skipToken,
			getNextPageParam: () => undefined,
		});
		expectTypeOf(skipped.queryFn).not.toExtend<PageQueryFn>();
		const query = queryUtils.get.queryOptions({
			request: skipToken,
			select: (data) => data.body.name,
		});
		expectTypeOf<
			ReturnType<NonNullable<typeof query.select>>
		>().toEqualTypeOf<string>();
		expectTypeOf<
			ReturnType<NonNullable<typeof options.select>>
		>().toEqualTypeOf<string[]>();
	});

	it("keeps reduced stream cache data distinct from selected data and validates refetch modes", () => {
		const reduced = queryUtils.events.streamedQueryOptions({
			initialValue: 0,
			reducer: (total, chunk) => total + chunk.data.value,
			select: (total) => {
				expectTypeOf(total).toEqualTypeOf<number>();
				return String(total);
			},
			refetchMode: "append",
		});
		expectTypeOf(
			new QueryClient().getQueryData(reduced.queryKey),
		).toEqualTypeOf<number | undefined>();
		expectTypeOf<
			ReturnType<NonNullable<typeof reduced.select>>
		>().toEqualTypeOf<string>();
		const simple = queryUtils.events.streamedQueryOptions({
			request: skipToken,
			refetchMode: "replace",
			select: (events) => events.length,
		});
		expectTypeOf(new QueryClient().getQueryData(simple.queryKey)).toEqualTypeOf<
			Array<SseEvent<{ value: number }>> | undefined
		>();
		expectTypeOf<
			ReturnType<NonNullable<typeof simple.select>>
		>().toEqualTypeOf<number>();
		queryUtils.events.streamedQueryOptions({ refetchMode: "reset" });
		// @ts-expect-error Refetch modes are restricted.
		queryUtils.events.streamedQueryOptions({ refetchMode: "merge" });
		// @ts-expect-error Initial values require a reducer.
		queryUtils.events.streamedQueryOptions({ initialValue: 0 });
	});
	it("requires requests only for routes with input and preserves success data in tagged keys", () => {
		const options = queryUtils.get.queryOptions({
			request: { params: { id: "1" } },
		});
		// Options with a request have a query function, as suspense hooks require.
		expectTypeOf(options.queryFn).toExtend<QueryFunction<GetResponse>>();
		expectTypeOf(queryUtils.empty.queryOptions().queryFn).toExtend<
			QueryFunction<InferClientResponse<typeof empty>>
		>();
		const request = Math.random() > 0.5 ? { params: { id: "1" } } : skipToken;
		for (const skippable of [
			queryUtils.get.queryOptions({ request: skipToken }),
			queryUtils.get.queryOptions({ request }),
		]) {
			expectTypeOf(skippable.queryFn).not.toExtend<
				QueryFunction<GetResponse>
			>();
		}
		queryUtils.empty.queryOptions();
		// @ts-expect-error Required params cannot be omitted.
		queryUtils.get.queryOptions();
		// @ts-expect-error The id is a string.
		queryUtils.get.queryOptions({ request: { params: { id: 1 } } });
		expectTypeOf<
			InferClientResponse<typeof get>["status"]
		>().toEqualTypeOf<200>();
		expectTypeOf(
			new QueryClient().getQueryData(options.queryKey),
		).toEqualTypeOf<InferClientResponse<typeof get> | undefined>();
		expectTypeOf<
			Parameters<
				NonNullable<
					ReturnType<typeof queryUtils.empty.mutationOptions>["mutationFn"]
				>
			>[0]
		>().toEqualTypeOf<InferClientRequest<typeof empty>>();
		queryUtils.empty.queryKey();
		// @ts-expect-error Routes without input take no request.
		queryUtils.empty.queryKey({});
		queryUtils.get.queryKey();
		expectTypeOf(
			new QueryClient().getQueryData(
				queryUtils.get.queryKey({ params: { id: "1" } }),
			),
		).toEqualTypeOf<InferClientResponse<typeof get> | undefined>();
		// @ts-expect-error The id is a string.
		queryUtils.get.queryKey({ params: { id: 1 } });
	});

	it("reserves key() on every node of the util tree", () => {
		expectTypeOf(queryUtils.key).returns.toEqualTypeOf<QueryKey>();
		expectTypeOf(queryUtils.get.key).returns.toEqualTypeOf<QueryKey>();
		const client = createClient(
			{ settings: { key: get } },
			{ origin: "https://example.test" },
		);
		// @ts-expect-error `key` is reserved for key().
		createTanstackQueryUtils(client);
	});

	it("tags keys of each query kind with the kind's cache data", () => {
		expectTypeOf(
			new QueryClient().getQueryData(queryUtils.get.infiniteQueryKey<number>()),
		).toEqualTypeOf<
			InfiniteData<InferClientResponse<typeof get>, number> | undefined
		>();
		expectTypeOf(
			new QueryClient().getQueryData(queryUtils.events.streamedQueryKey()),
		).toEqualTypeOf<Array<SseEvent<{ value: number }>> | undefined>();
		expectTypeOf(
			new QueryClient().getQueryData(
				queryUtils.events.streamedQueryKey<number>(),
			),
		).toEqualTypeOf<number | undefined>();
		// @ts-expect-error Non-stream routes have no streamed queries.
		queryUtils.get.streamedQueryKey();
	});

	it("infers selected data and infinite page request parameters", () => {
		queryUtils.get.queryOptions({
			request: { params: { id: "1" } },
			select: (response) => {
				expectTypeOf(response.body).toEqualTypeOf<{ name: string }>();
				return response.body.name;
			},
		});
		queryUtils.get.infiniteQueryOptions({
			initialPageParam: 0,
			request: (page) => {
				expectTypeOf(page).toEqualTypeOf<number>();
				return { params: { id: String(page) } };
			},
			getNextPageParam: () => undefined,
		});
	});

	it("exposes streaming options only for streams and infers reducer chunks", () => {
		expectTypeOf(
			new QueryClient().getQueryData(
				queryUtils.events.streamedQueryOptions().queryKey,
			),
		).toEqualTypeOf<Array<SseEvent<{ value: number }>> | undefined>();
		queryUtils.events.streamedQueryOptions({
			initialValue: 0,
			reducer: (total, chunk) => {
				expectTypeOf(total).toEqualTypeOf<number>();
				expectTypeOf(chunk).toEqualTypeOf<SseEvent<{ value: number }>>();
				return total + chunk.data.value;
			},
		});
		// @ts-expect-error Non-stream routes have no streaming options.
		queryUtils.get.streamedQueryOptions();
		// @ts-expect-error A reducer requires an initial value.
		queryUtils.events.streamedQueryOptions({
			reducer: (total: number) => total,
		});
	});

	it("allows to call the underlying fetch function directly", async () => {
		const data = await queryUtils.get.fetch({ params: { id: "1" } });
		expectTypeOf(data).toEqualTypeOf<InferClientResponse<typeof get>>();
		expectTypeOf(data.body).toEqualTypeOf<{ name: string }>();
	});
});
