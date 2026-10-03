import { route, type, type SseEvent } from "@rest-rpc/core";
import { QueryClient, skipToken } from "@tanstack/query-core";
import {
	createTanstackQueryUtils,
	type InferQueryData,
	type InferMutationVariables,
	type InferStreamedQueryData,
	type InferQueryError,
	type InferInfiniteQueryData,
} from "./createTanstackQueryUtils.ts";

const get = route
	.get("/users/{id}")
	.params(type<{ id: string }>())
	.response(200, type<{ name: string }>())
	.response(404, type<{ message: string }>());
const empty = route.get("/health").response(204);
const events = route
	.get("/events")
	.streamResponse(200, type<{ value: number }>());
const utils = createTanstackQueryUtils(
	{ get, empty, events },
	{ baseUrl: "https://example.test" },
);

describe("createTanstackQueryUtils types", () => {
	it("preserves mutation variables, successful results, and declared errors", () => {
		const options = utils.get.mutationOptions({
			onSuccess: (data, variables) => {
				expectTypeOf(data).toEqualTypeOf<InferQueryData<typeof get>>();
				expectTypeOf(variables).toEqualTypeOf<{ params: { id: string } }>();
			},
			onError: (error) => {
				expectTypeOf(error).toEqualTypeOf<InferQueryError<typeof get>>();
				if ("status" in error && error.status === 404 && "headers" in error) {
					expectTypeOf(error.body).toEqualTypeOf<{ message: string }>();
				}
			},
		});
		expectTypeOf<
			Parameters<NonNullable<typeof options.mutationFn>>[0]
		>().toEqualTypeOf<{ params: { id: string } }>();
		expectTypeOf<
			Awaited<ReturnType<NonNullable<typeof options.mutationFn>>>
		>().toEqualTypeOf<InferQueryData<typeof get>>();
	});

	it("requires declared custom-media fetch options for queries and mutations", () => {
		const custom = route
			.post("/")
			.body(type<string>(), { contentType: ["text/plain", "text/html"] })
			.response(200, type<string>());
		const customUtils = createTanstackQueryUtils(custom, { baseUrl: "" });
		customUtils.queryOptions({
			request: { body: "hello" },
			fetchOptions: { contentType: "text/plain" },
		});
		customUtils.mutationOptions({ fetchOptions: { contentType: "text/html" } });
		customUtils.infiniteQueryOptions({
			initialPageParam: 0,
			request: () => ({ body: "hello" }),
			fetchOptions: { contentType: "text/plain" },
			getNextPageParam: () => undefined,
		});
		// @ts-expect-error Query options require media selection.
		customUtils.queryOptions({ request: { body: "hello" } });
		// @ts-expect-error Mutation options require media selection.
		customUtils.mutationOptions();
		customUtils.mutationOptions({
			fetchOptions: {
				// @ts-expect-error Only declared media types are allowed.
				contentType: "application/json",
			},
		});
	});

	it("uses guaranteed global headers in query requests and mutation variables", () => {
		const secured = route
			.get("/")
			.headers(type<{ token: string; optional?: string }>())
			.response(200, type<string>());
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
					Array<InferQueryData<typeof get>>
				>();
				expectTypeOf(data.pageParams).toEqualTypeOf<number[]>();
				return data.pages.map((page) => page.body.name);
			},
		});
		expectTypeOf(
			new QueryClient().getQueryData(options.queryKey),
		).toEqualTypeOf<InferInfiniteQueryData<typeof get, number> | undefined>();
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
			InferStreamedQueryData<typeof events> | undefined
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
		expectTypeOf<InferQueryData<typeof get>["status"]>().toEqualTypeOf<200>();
		expectTypeOf(
			new QueryClient().getQueryData(options.queryKey),
		).toEqualTypeOf<InferQueryData<typeof get> | undefined>();
		expectTypeOf<
			InferMutationVariables<typeof empty>
		>().toEqualTypeOf<undefined>();
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
		expectTypeOf<InferStreamedQueryData<typeof events>>().toEqualTypeOf<
			Array<SseEvent<{ value: number }>>
		>();
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

	it("infers helper types for a route tree", () => {
		const tree = { users: { get }, events };
		expectTypeOf<InferQueryData<typeof tree>["users"]["get"]>().toEqualTypeOf<
			InferQueryData<typeof get>
		>();
		expectTypeOf<InferQueryError<typeof tree>["users"]["get"]>().toEqualTypeOf<
			InferQueryError<typeof get>
		>();
		expectTypeOf<
			InferMutationVariables<typeof tree>["users"]["get"]
		>().toEqualTypeOf<InferMutationVariables<typeof get>>();
		expectTypeOf<
			InferInfiniteQueryData<typeof tree, number>["users"]["get"]
		>().toEqualTypeOf<InferInfiniteQueryData<typeof get, number>>();
		expectTypeOf<InferStreamedQueryData<typeof tree>["events"]>().toEqualTypeOf<
			InferStreamedQueryData<typeof events>
		>();
	});
});
