import { router, type as schemaType, stream } from "@rest-rpc/core/contract";
import {
	initTanstackQuery,
	type RouteMutationVariables,
	type RouteQueryData,
} from "@rest-rpc/tanstack-query";
import {
	type InfiniteData,
	type QueryClient,
	skipToken,
} from "@tanstack/query-core";
import {
	expectAssignable,
	expectError,
	expectNotAssignable,
	expectType,
} from "tsd";

declare const queryClient: QueryClient;

// query options

// should create request-aware query options that carry typed data through QueryClient
const queryApi = router({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: schemaType<Array<{ id: string; title: string }>>(),
			},
		},
		get: {
			method: "GET",
			path: "/todos/:id",
			pathParams: schemaType<{ id: string }>(),
			responses: {
				200: schemaType<{ id: string; title: string }>(),
			},
		},
	},
});

const queryTq = initTanstackQuery(queryApi, {
	baseUrl: "https://example.test",
});

const getOptions = queryTq.todos.get.queryOptions({ id: "todo-1" });
expectAssignable<readonly unknown[]>(getOptions.queryKey);
expectAssignable<
	Promise<{
		status: 200;
		body: { id: string; title: string };
		headers: Headers;
	}>
>(queryClient.fetchQuery(getOptions));
expectAssignable<
	| {
			status: 200;
			body: { id: string; title: string };
			headers: Headers;
	  }
	| undefined
>(queryClient.getQueryData(getOptions.queryKey));
queryClient.setQueryData(getOptions.queryKey, (current) => {
	expectAssignable<
		| {
				status: 200;
				body: { id: string; title: string };
				headers: Headers;
		  }
		| undefined
	>(current);
	return current;
});

// select options

// should preserve selected data callbacks while fetchQuery still resolves route data
type GetTodoData = RouteQueryData<typeof queryApi.todos.get>;
const selectedGetOptions = queryTq.todos.get.queryOptions(
	{
		id: "todo-1",
	},
	{
		select(data) {
			expectAssignable<{
				status: 200;
				body: { id: string; title: string };
				headers: Headers;
			}>(data);
			return data.body.title;
		},
	},
);
expectAssignable<(data: GetTodoData) => string>(
	selectedGetOptions.select as NonNullable<typeof selectedGetOptions.select>,
);
expectAssignable<Promise<GetTodoData>>(
	queryClient.fetchQuery(selectedGetOptions),
);

// should treat routes without request input as options-only query routes
const selectedListOptions = queryTq.todos.list.queryOptions({
	queryKey: ["todos", "custom"],
	staleTime: 100,
	fetchOptions: {
		cache: "no-store",
		credentials: "include",
	},
	select(data) {
		expectAssignable<{
			status: 200;
			body: Array<{ id: string; title: string }>;
			headers: Headers;
		}>(data);
		return data.body.map((todo) => todo.title);
	},
});
expectAssignable<
	(data: RouteQueryData<typeof queryApi.todos.list>) => string[]
>(selectedListOptions.select as NonNullable<typeof selectedListOptions.select>);
expectAssignable<Promise<RouteQueryData<typeof queryApi.todos.list>>>(
	queryClient.fetchQuery(selectedListOptions),
);

// stream query options

// should expose stream routes as regular query data with raw async iterable bodies
const streamApi = router({
	events: {
		list: {
			method: "GET",
			path: "/events",
			responses: {
				200: stream(schemaType<{ id: string; message: string }>()),
			},
		},
	},
});

const streamTq = initTanstackQuery(streamApi, {
	baseUrl: "https://example.test",
});

const streamOptions = streamTq.events.list.queryOptions();
expectAssignable<
	Promise<{
		status: 200;
		body: AsyncIterable<{ id: string; message: string }>;
		headers: Headers;
	}>
>(queryClient.fetchQuery(streamOptions));
expectAssignable<
	| {
			status: 200;
			body: AsyncIterable<{ id: string; message: string }>;
			headers: Headers;
	  }
	| undefined
>(queryClient.getQueryData(streamOptions.queryKey));

// conditional query input

// should accept skipToken or falsy request values for conditional request input
const optionalId: string | undefined = "todo-1";

const maybeRequest = optionalId && { id: optionalId };
const conditionalOptions = queryTq.todos.get.queryOptions(maybeRequest, {
	queryKey: ["todos", "conditional"],
	staleTime: 100,
});
expectAssignable<
	typeof skipToken | NonNullable<typeof getOptions.queryFn> | undefined
>(conditionalOptions.queryFn);

const skippedOptions = queryTq.todos.get.queryOptions(
	optionalId ? { id: optionalId } : skipToken,
	{
		queryKey: ["todos", "disabled"],
		staleTime: 100,
	},
);
expectAssignable<
	typeof skipToken | NonNullable<typeof getOptions.queryFn> | undefined
>(skippedOptions.queryFn);

// request and fetch options

// should keep request input and options as separate arguments for request-based routes
queryTq.todos.get.queryOptions({ id: "todo-1" }, { retry: false });
queryTq.todos.get.queryOptions(
	{ id: "todo-1" },
	{
		fetchOptions: { cache: "reload", credentials: "same-origin" },
		gcTime: 1_000,
	},
);

// mutation options

// should create mutation options with typed data and variables callbacks
const mutationApi = router({
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			body: schemaType<{ title: string }>(),
			responses: {
				201: schemaType<{ id: string; title: string }>(),
			},
		},
	},
});

const mutationTq = initTanstackQuery(mutationApi, {
	baseUrl: "https://example.test",
});

mutationTq.todos.create.mutationOptions({
	fetchOptions: {
		cache: "no-store",
	},
	onSuccess(data, variables) {
		expectAssignable<{
			status: 201;
			body: { id: string; title: string };
			headers: Headers;
		}>(data);
		expectType<{ title: string }>(variables);
	},
});

// infinite query options

// should carry page response data and request page params through infinite queries
const pageApi = router({
	todos: {
		page: {
			method: "GET",
			path: "/todos/page",
			query: schemaType<{
				cursor?: string;
				status: "open" | "done";
				limit: number;
			}>(),
			responses: {
				200: schemaType<{
					items: Array<{ id: string; title: string }>;
					nextCursor?: string;
				}>(),
			},
		},
	},
});

const pageTq = initTanstackQuery(pageApi, {
	baseUrl: "https://example.test",
});

const infiniteOptions = pageTq.todos.page.infiniteQueryOptions({
	queryKey: ["todos", { status: "open" }],
	initialPageParam: { status: "open", limit: 50 },
	fetchOptions: { cache: "no-store" },
	getNextPageParam(lastPage, _allPages, lastRequest) {
		expectAssignable<{
			status: 200;
			body: {
				items: Array<{ id: string; title: string }>;
				nextCursor?: string;
			};
			headers: Headers;
		}>(lastPage);
		expectType<{
			cursor?: string;
			status: "open" | "done";
			limit: number;
		}>(lastRequest);
		return lastPage.body.nextCursor
			? { ...lastRequest, cursor: lastPage.body.nextCursor }
			: undefined;
	},
});
expectAssignable<
	Promise<
		InfiniteData<
			{
				status: 200;
				body: {
					items: Array<{ id: string; title: string }>;
					nextCursor?: string;
				};
				headers: Headers;
			},
			{ cursor?: string; status: "open" | "done"; limit: number }
		>
	>
>(queryClient.fetchInfiniteQuery(infiniteOptions));
expectAssignable<
	| InfiniteData<
			{
				status: 200;
				body: {
					items: Array<{ id: string; title: string }>;
					nextCursor?: string;
				};
				headers: Headers;
			},
			{ cursor?: string; status: "open" | "done"; limit: number }
	  >
	| undefined
>(queryClient.getQueryData(infiniteOptions.queryKey));

// query keys

// should generate reusable typed keys for QueryClient cache operations
const getKey = queryTq.todos.get.getKey({ id: "todo-1" });
expectAssignable<readonly unknown[]>(getKey);
queryClient.invalidateQueries({ queryKey: getKey });
queryClient.removeQueries({ queryKey: getKey });
queryClient.setQueryData(getKey, (current) => {
	expectAssignable<
		| {
				status: 200;
				body: { id: string; title: string };
				headers: Headers;
		  }
		| undefined
	>(current);
	return current;
});
const listKey = queryTq.todos.list.getKey();
queryClient.invalidateQueries({ queryKey: listKey });
queryClient.setQueryData(listKey, (current) => current);

// invalid calls

// should reject malformed request input, options placement, infinite options, and websocket routes
const invalidApi = router({
	todos: {
		list: queryApi.todos.list,
		get: queryApi.todos.get,
		page: pageApi.todos.page,
	},
	events: {
		method: "GET",
		path: "/events",
		mode: "webSocket",
		messages: {
			client: schemaType<{ subscribe: boolean }>(),
			server: schemaType<{ id: string }>(),
		},
	},
});

const invalidTq = initTanstackQuery(invalidApi, {
	baseUrl: "https://example.test",
});

expectError(invalidTq.todos.get.queryOptions());
expectError(invalidTq.todos.get.queryOptions({ id: "todo-1", extra: true }));
expectError(
	invalidTq.todos.get.queryOptions(
		{ id: "todo-1" },
		{ fetchOptions: { nope: true } },
	),
);
expectError(invalidTq.todos.get.queryOptions({ retry: false }));
expectError(invalidTq.todos.list.queryOptions({ id: "todo-1" }));
expectError(invalidTq.todos.list.queryOptions(undefined, { retry: false }));
expectError(invalidTq.todos.list.queryOptions(skipToken));
expectError(invalidTq.todos.get.getKey());
expectError(invalidTq.todos.get.getKey({ id: "todo-1", extra: true }));
expectError(invalidTq.todos.list.getKey({ queryKey: ["todos", "list"] }));
expectError(
	invalidTq.todos.page.infiniteQueryOptions({
		initialPageParam: { status: "open", limit: 50 },
		getNextPageParam: () => undefined,
	}),
);
expectError(
	invalidTq.todos.page.infiniteQueryOptions({
		queryKey: ["todos"],
		initialPageParam: { status: "open", limit: 50, extra: true },
		getNextPageParam: () => undefined,
	}),
);
expectError(
	invalidTq.todos.list.infiniteQueryOptions({
		queryKey: ["todos"],
		getNextPageParam: () => undefined,
	}),
);
expectError(invalidTq.events);

// exported helper types

// should resolve route query data and mutation variables for external consumers
expectAssignable<{
	status: 200;
	body: { id: string; title: string };
	headers: Headers;
}>(null as unknown as GetTodoData);

type CreateTodoVariables = RouteMutationVariables<
	typeof mutationApi.todos.create
>;
expectType<{ title: string }>(null as unknown as CreateTodoVariables);
expectNotAssignable<{ id: string }>(null as unknown as CreateTodoVariables);
