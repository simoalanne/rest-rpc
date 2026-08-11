import type { StandardSchemaV1 } from "@rest-rpc/core";
import { router } from "@rest-rpc/core/contract";
import {
	type InferRouteMutationVariables,
	type InferRouteQueryData,
	initTanstackQuery,
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

declare const todoSchema: StandardSchemaV1<
	{ id: string; title: string },
	{ id: string; title: string }
>;
declare const todoListSchema: StandardSchemaV1<
	Array<{ id: string; title: string }>,
	Array<{ id: string; title: string }>
>;
declare const todoPageSchema: StandardSchemaV1<
	{ items: Array<{ id: string; title: string }>; nextCursor?: string },
	{ items: Array<{ id: string; title: string }>; nextCursor?: string }
>;
declare const todoParamsSchema: StandardSchemaV1<
	{ id: string },
	{ id: string }
>;
declare const todoPageParamsSchema: StandardSchemaV1<
	{ cursor?: string; status: "open" | "done"; limit: number },
	{ cursor?: string; status: "open" | "done"; limit: number }
>;
declare const createTodoSchema: StandardSchemaV1<
	{ title: string },
	{ title: string }
>;
declare const clientMessageSchema: StandardSchemaV1<
	{ subscribe: boolean },
	{ subscribe: boolean }
>;
declare const serverMessageSchema: StandardSchemaV1<
	{ id: string },
	{ id: string }
>;

const api = router({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: todoListSchema,
			},
		},
		get: {
			method: "GET",
			path: "/todos/:id",
			request: {
				params: todoParamsSchema,
			},
			responses: {
				200: todoSchema,
			},
		},
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: createTodoSchema,
			},
			responses: {
				201: todoSchema,
			},
		},
		page: {
			method: "GET",
			path: "/todos/page",
			request: {
				query: todoPageParamsSchema,
			},
			responses: {
				200: todoPageSchema,
			},
		},
	},
	events: {
		method: "GET",
		path: "/events",
		options: { mode: "websocket" },
		messages: {
			client: clientMessageSchema,
			server: serverMessageSchema,
		},
	},
});

declare const queryClient: QueryClient;

const tq = initTanstackQuery(api, {
	origin: "https://example.test",
});

const getOptions = tq.todos.get.queryOptions({ id: "todo-1" });
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

const selectedGetOptions = tq.todos.get.queryOptions(
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

const selectedListOptions = tq.todos.list.queryOptions({
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
	(data: InferRouteQueryData<typeof api.todos.list>) => string[]
>(selectedListOptions.select as NonNullable<typeof selectedListOptions.select>);
expectAssignable<Promise<InferRouteQueryData<typeof api.todos.list>>>(
	queryClient.fetchQuery(selectedListOptions),
);

const optionalId: string | undefined = "todo-1";

// queryOptions accepts skipToken or falsy request values for conditional request input.
const maybeRequest = optionalId && { id: optionalId };
const conditionalOptions = tq.todos.get.queryOptions(maybeRequest, {
	queryKey: ["todos", "conditional"],
	staleTime: 100,
});
expectAssignable<
	typeof skipToken | NonNullable<typeof getOptions.queryFn> | undefined
>(conditionalOptions.queryFn);

const skippedOptions = tq.todos.get.queryOptions(
	optionalId ? { id: optionalId } : skipToken,
	{
		queryKey: ["todos", "disabled"],
		staleTime: 100,
	},
);
expectAssignable<
	typeof skipToken | NonNullable<typeof getOptions.queryFn> | undefined
>(skippedOptions.queryFn);

// Request-based routes keep request input and options as separate arguments.
tq.todos.get.queryOptions({ id: "todo-1" }, { retry: false });
tq.todos.get.queryOptions(
	{ id: "todo-1" },
	{
		fetchOptions: { cache: "reload", credentials: "same-origin" },
		gcTime: 1_000,
	},
);

tq.todos.create.mutationOptions({
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
const infiniteOptions = tq.todos.page.infiniteQueryOptions({
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
const getKey = tq.todos.get.getKey({ id: "todo-1" });
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
const listKey = tq.todos.list.getKey();
queryClient.invalidateQueries({ queryKey: listKey });
queryClient.setQueryData(listKey, (current) => current);

expectError(tq.todos.get.queryOptions());
expectError(tq.todos.get.queryOptions({ id: "todo-1", extra: true }));
expectError(
	tq.todos.get.queryOptions({ id: "todo-1" }, { fetchOptions: { nope: true } }),
);
expectError(tq.todos.get.queryOptions({ retry: false }));
// Routes without request input treat the first argument as query options.
expectError(tq.todos.list.queryOptions({ id: "todo-1" }));
expectError(tq.todos.list.queryOptions(undefined, { retry: false }));
expectError(tq.todos.list.queryOptions(skipToken));
expectError(tq.todos.get.getKey());
expectError(tq.todos.get.getKey({ id: "todo-1", extra: true }));
expectError(tq.todos.list.getKey({ queryKey: ["todos", "list"] }));
expectError(
	tq.todos.page.infiniteQueryOptions({
		initialPageParam: { status: "open", limit: 50 },
		getNextPageParam: () => undefined,
	}),
);
expectError(
	tq.todos.page.infiniteQueryOptions({
		queryKey: ["todos"],
		initialPageParam: { status: "open", limit: 50, extra: true },
		getNextPageParam: () => undefined,
	}),
);
expectError(
	tq.todos.list.infiniteQueryOptions({
		queryKey: ["todos"],
		getNextPageParam: () => undefined,
	}),
);
// WebSocket routes are intentionally omitted from the TanStack Query client.
expectError(tq.events);

type GetTodoData = InferRouteQueryData<typeof api.todos.get>;
expectAssignable<{
	status: 200;
	body: { id: string; title: string };
	headers: Headers;
}>(null as unknown as GetTodoData);

type CreateTodoVariables = InferRouteMutationVariables<typeof api.todos.create>;
expectType<{ title: string }>(null as unknown as CreateTodoVariables);
expectNotAssignable<{ id: string }>(null as unknown as CreateTodoVariables);
