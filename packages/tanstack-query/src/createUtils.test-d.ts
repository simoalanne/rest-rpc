import {
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
} from "@tanstack/query-core";
import { createTanstackQueryUtils } from "./index.ts";

const get = route
	.get("/users/{id}")
	.params(type<{ id: string }>())
	.response(type<{ name: string }>())
	.error(
		routeError("NOT_FOUND", { status: 404, data: type<{ id: string }>() }),
	);
const empty = route.get("/health").response({ status: 204 });
const events = route.get("/events").response(sse(type<{ value: number }>()));
const utils = createTanstackQueryUtils(
	{ get, empty, events },
	{ baseUrl: "https://example.test" },
);

describe("createTanstackQueryUtils types", () => {
	it("preserves mutation variables, successful results, and defined errors", () => {
		const options = utils.get.mutationOptions({
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
		const securedUtils = createTanstackQueryUtils(secured, {
			baseUrl: "",
			globalHeaders: { token: async () => "token" },
		});
		securedUtils.queryOptions({ request: {} });
		expectTypeOf<
			Parameters<
				NonNullable<
					ReturnType<typeof securedUtils.mutationOptions>["mutationFn"]
				>
			>[0]
		>().toEqualTypeOf<{ headers?: { token?: string; optional?: string } }>();
		const uncertainUtils = createTanstackQueryUtils(secured, {
			baseUrl: "",
			globalHeaders: { token: (): string | undefined => undefined },
		});
		// @ts-expect-error An optional provider does not satisfy the token requirement.
		uncertainUtils.queryOptions({ request: {} });
	});

	it("tags infinite query caches with pages and page parameters", () => {
		const options = utils.get.infiniteQueryOptions({
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
		utils.get.infiniteQueryOptions({
			initialPageParam: 0,
			request: skipToken,
			getNextPageParam: () => undefined,
		});
		const query = utils.get.queryOptions({
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
		const reduced = utils.events.streamedQueryOptions({
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
		const simple = utils.events.streamedQueryOptions({
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
		utils.events.streamedQueryOptions({ refetchMode: "reset" });
		// @ts-expect-error Refetch modes are restricted.
		utils.events.streamedQueryOptions({ refetchMode: "merge" });
		// @ts-expect-error Initial values require a reducer.
		utils.events.streamedQueryOptions({ initialValue: 0 });
	});
	it("requires requests only for routes with input and preserves success data in tagged keys", () => {
		const options = utils.get.queryOptions({
			request: { params: { id: "1" } },
		});
		utils.get.queryOptions({ request: skipToken });
		utils.empty.queryOptions();
		// @ts-expect-error Required params cannot be omitted.
		utils.get.queryOptions();
		// @ts-expect-error The id is a string.
		utils.get.queryOptions({ request: { params: { id: 1 } } });
		expectTypeOf<
			InferClientResponse<typeof get>["status"]
		>().toEqualTypeOf<200>();
		expectTypeOf(
			new QueryClient().getQueryData(options.queryKey),
		).toEqualTypeOf<InferClientResponse<typeof get> | undefined>();
		expectTypeOf<
			Parameters<
				NonNullable<
					ReturnType<typeof utils.empty.mutationOptions>["mutationFn"]
				>
			>[0]
		>().toEqualTypeOf<InferClientRequest<typeof empty>>();
		utils.empty.queryKey();
	});

	it("infers selected data and infinite page request parameters", () => {
		utils.get.queryOptions({
			request: { params: { id: "1" } },
			select: (response) => {
				expectTypeOf(response.body).toEqualTypeOf<{ name: string }>();
				return response.body.name;
			},
		});
		utils.get.infiniteQueryOptions({
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
				utils.events.streamedQueryOptions().queryKey,
			),
		).toEqualTypeOf<Array<SseEvent<{ value: number }>> | undefined>();
		utils.events.streamedQueryOptions({
			initialValue: 0,
			reducer: (total, chunk) => {
				expectTypeOf(total).toEqualTypeOf<number>();
				expectTypeOf(chunk).toEqualTypeOf<SseEvent<{ value: number }>>();
				return total + chunk.data.value;
			},
		});
		// @ts-expect-error Non-stream routes have no streaming options.
		utils.get.streamedQueryOptions();
		// @ts-expect-error A reducer requires an initial value.
		utils.events.streamedQueryOptions({ reducer: (total: number) => total });
	});
});
