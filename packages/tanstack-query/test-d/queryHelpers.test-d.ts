import { route, type as schemaType } from "@rest-rpc/core";
import {
	createTanstackQueryHelpers,
	type CreateTanstackQueryHelpersOptions,
	type RouteInfiniteQueryData,
	type RouteMutationVariables,
	type RouteQueryData,
	type RouteQueryError,
	type RouteStreamedQueryData,
	type TanstackQueryHelpersFor,
} from "@rest-rpc/tanstack-query";
import { type QueryClient, skipToken } from "@tanstack/query-core";
import {
	expectAssignable,
	expectError,
	expectNotAssignable,
	expectType,
} from "tsd";

declare const queryClient: QueryClient;

// query options

// should create request-aware query options that carry typed data through QueryClient
const queryApi = {
	todos: {
		list: route
			.get("/todos")
			.response(200, schemaType<Array<{ id: string; title: string }>>()),
		get: route
			.get("/todos/:id")
			.params(schemaType<{ id: string }>())
			.response(200, schemaType<{ id: string; title: string }>()),
	},
};

const queryTq = createTanstackQueryHelpers(queryApi, {
	baseUrl: "https://example.test",
});

const validatedQueryApi = {
	test: route
		.get("/test/:id")
		.params(schemaType<{ id: string }>())
		.response(200, schemaType<{ id: string; title: string }>()),
};
const validatedQueryTq = createTanstackQueryHelpers(validatedQueryApi, {
	baseUrl: "https://example.test",
});
type ValidatedQueryOptionsParameters = Parameters<
	typeof validatedQueryTq.test.queryOptions
>;
expectType<{ id: string }>(
	undefined as unknown as Extract<
		ValidatedQueryOptionsParameters[0],
		{ id: string }
	>,
);

type FinalizedQueryData = RouteQueryData<typeof validatedQueryApi.test>;
expectType<{
	status: 200;
	body: { id: string; title: string };
	headers: Headers;
}>(undefined as unknown as FinalizedQueryData);

expectAssignable<TanstackQueryHelpersFor<typeof queryApi>>(queryTq);
expectAssignable<CreateTanstackQueryHelpersOptions>({
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

expectAssignable<RouteQueryError<typeof queryApi.todos.get>>({
	declared: false,
	status: 500,
	body: "server exploded",
	headers: new Headers(),
});

// strict status code options

// should allow strict status codes and remove undeclared responses from query errors
const strictStatusApi = {
	todos: {
		get: route
			.with({ strictStatusCodes: true })
			.get("/todos/:id")
			.params(schemaType<{ id: string }>())
			.response(200, schemaType<{ id: string; title: string }>())
			.response(404, schemaType<{ code: "TODO_NOT_FOUND" }>()),
	},
};

const strictStatusTq = createTanstackQueryHelpers(strictStatusApi, {
	baseUrl: "https://example.test",
});
expectAssignable<TanstackQueryHelpersFor<typeof strictStatusApi>>(
	strictStatusTq,
);

const strictStatusOptions = strictStatusTq.todos.get.queryOptions({
	id: "todo-1",
});

expectAssignable<
	Promise<{
		status: 200;
		body: { id: string; title: string };
		headers: Headers;
	}>
>(queryClient.fetchQuery(strictStatusOptions));
expectAssignable<RouteQueryError<typeof strictStatusApi.todos.get>>({
	status: 404,
	body: { code: "TODO_NOT_FOUND" },
	headers: new Headers(),
});
expectNotAssignable<RouteQueryError<typeof strictStatusApi.todos.get>>({
	declared: false,
	status: 500,
	body: "server exploded",
	headers: new Headers(),
});

// stream query options

// should expose stream routes as regular query data with raw async iterable bodies
const streamApi = {
	events: {
		list: route
			.get("/events")
			.streamResponse(200, schemaType<{ id: string; message: string }>()),
	},
};

const streamTq = createTanstackQueryHelpers(streamApi, {
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

const materializedStreamOptions = streamTq.events.list.streamedQueryOptions();
expectAssignable<Promise<Array<{ id: string; message: string }>>>(
	queryClient.fetchQuery(materializedStreamOptions),
);
expectAssignable<Array<{ id: string; message: string }> | undefined>(
	queryClient.getQueryData(materializedStreamOptions.queryKey),
);

const selectedStreamOptions = streamTq.events.list.streamedQueryOptions({
	select(events) {
		expectType<Array<{ id: string; message: string }>>(events);
		return events.length;
	},
});
expectAssignable<Promise<Array<{ id: string; message: string }>>>(
	queryClient.fetchQuery(selectedStreamOptions),
);
expectAssignable<Array<{ id: string; message: string }> | undefined>(
	queryClient.getQueryData(selectedStreamOptions.queryKey),
);

const reducedStreamOptions = streamTq.events.list.streamedQueryOptions({
	initialValue: "",
	reducer: (text, chunk) => {
		expectType<string>(text);
		expectType<{ id: string; message: string }>(chunk);
		return `${text}${chunk.message}`;
	},
});
expectAssignable<Promise<string>>(queryClient.fetchQuery(reducedStreamOptions));
expectAssignable<string | undefined>(
	queryClient.getQueryData(reducedStreamOptions.queryKey),
);

const arrayReducedStreamOptions = streamTq.events.list.streamedQueryOptions({
	initialValue: [] as Array<{ id: string; message: string }>,
	reducer: (events, chunk) => {
		expectType<Array<{ id: string; message: string }>>(events);
		expectType<{ id: string; message: string }>(chunk);
		return [...events, chunk];
	},
	refetchMode: "replace",
});
expectAssignable<Promise<Array<{ id: string; message: string }>>>(
	queryClient.fetchQuery(arrayReducedStreamOptions),
);
expectAssignable<Array<{ id: string; message: string }> | undefined>(
	queryClient.getQueryData(arrayReducedStreamOptions.queryKey),
);

const selectedReducedStreamOptions = streamTq.events.list.streamedQueryOptions({
	initialValue: new Map<string, string>(),
	reducer: (messages, chunk) => {
		expectType<Map<string, string>>(messages);
		expectType<{ id: string; message: string }>(chunk);
		return new Map(messages).set(chunk.id, chunk.message);
	},
	refetchMode: "append",
	select(messages) {
		expectType<Map<string, string>>(messages);
		return [...messages.values()];
	},
});
expectAssignable<Promise<Map<string, string>>>(
	queryClient.fetchQuery(selectedReducedStreamOptions),
);
expectAssignable<Map<string, string> | undefined>(
	queryClient.getQueryData(selectedReducedStreamOptions.queryKey),
);

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
const mutationApi = {
	todos: {
		create: route
			.post("/todos")
			.body(schemaType<{ title: string }>())
			.response(201, schemaType<{ id: string; title: string }>()),
	},
};

const mutationTq = createTanstackQueryHelpers(mutationApi, {
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
const pageApi = {
	todos: {
		page: route
			.get("/todos/page")
			.query(
				schemaType<{
					cursor?: string;
					status: "open" | "done";
					limit: number;
				}>(),
			)
			.response(
				200,
				schemaType<{
					items: Array<{ id: string; title: string }>;
					nextCursor?: string;
				}>(),
			),
	},
};

const pageTq = createTanstackQueryHelpers(pageApi, {
	baseUrl: "https://example.test",
});

type TodoPageResponse = RouteQueryData<typeof pageApi.todos.page>;
type TodoInfiniteData = RouteInfiniteQueryData<typeof pageApi.todos.page>;

type TodoPageResponseShape = {
	status: 200;
	body: {
		items: Array<{ id: string; title: string }>;
		nextCursor?: string;
	};
	headers: Headers;
};

type TodoPageRequest = {
	cursor?: string;
	status: "open" | "done";
	limit: number;
};

const infiniteOptions = pageTq.todos.page.infiniteQueryOptions({
	initialRequest: { status: "open", limit: 50 },
	fetchOptions: { cache: "no-store" },
	getNextRequest(lastPage, _allPages, lastRequest) {
		expectAssignable<TodoPageResponseShape>(lastPage);
		expectType<TodoPageRequest>(lastRequest);
		return lastPage.body.nextCursor
			? { ...lastRequest, cursor: lastPage.body.nextCursor }
			: undefined;
	},
});

queryClient.fetchInfiniteQuery(infiniteOptions).then((data) => {
	expectType<TodoInfiniteData>(data);
	expectType<Array<TodoPageResponse>>(data.pages);
	expectType<Array<TodoPageRequest>>(data.pageParams);
	expectAssignable<TodoPageResponseShape>(data.pages[0]);
});

const cachedInfiniteData = queryClient.getQueryData(infiniteOptions.queryKey);
if (cachedInfiniteData) {
	expectType<TodoInfiniteData>(cachedInfiniteData);
	expectType<Array<TodoPageResponse>>(cachedInfiniteData.pages);
	expectType<Array<TodoPageRequest>>(cachedInfiniteData.pageParams);
	expectAssignable<TodoPageResponseShape>(cachedInfiniteData.pages[0]);
}

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

// should reject malformed request input, options placement, infinite options, and websocket/sse routes
const invalidApi = {
	todos: {
		list: queryApi.todos.list,
		get: queryApi.todos.get,
		page: pageApi.todos.page,
	},
	normalStream: streamApi.events.list,
	ambiguousStream: route
		.get("/ambiguous-stream")
		.streamResponse(200, schemaType<{ id: string; message: string }>())
		.response(202, schemaType<{ pending: true }>()),
	events: route
		.ws("/events")
		.clientMessage("subscribe", schemaType<{ subscribe: boolean }>())
		.serverMessage("id", schemaType<{ id: string }>()),
	feeds: {
		live: route
			.sse("/feeds/live")
			.response(schemaType<{ id: string; message: string }>()),
	},
	mixed: {
		live: route
			.sse("/mixed/live")
			.response(schemaType<{ id: string; message: string }>()),
		list: queryApi.todos.list,
	},
};

const invalidTq = createTanstackQueryHelpers(invalidApi, {
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
expectError(invalidTq.todos.get.streamedQueryOptions({ id: "todo-1" }));
invalidTq.normalStream.streamedQueryOptions();
expectError(invalidTq.ambiguousStream.streamedQueryOptions());
expectError(
	invalidTq.todos.page.infiniteQueryOptions({
		initialPageParam: { status: "open", limit: 50 },
		getNextRequest: () => undefined,
	}),
);
expectError(
	invalidTq.todos.page.infiniteQueryOptions({
		initialRequest: { status: "open", limit: 50, extra: true },
		getNextRequest: () => undefined,
	}),
);
expectError(
	invalidTq.todos.page.infiniteQueryOptions({
		initialRequest: { status: "open", limit: 50 },
		getNextPageParam: () => undefined,
	}),
);
expectError(
	invalidTq.todos.list.infiniteQueryOptions({
		initialRequest: {},
		getNextRequest: () => undefined,
	}),
);
expectError(invalidTq.events);
expectError(invalidTq.feeds.live.queryOptions());
expectError(invalidTq.mixed.live.queryOptions());
invalidTq.mixed.list.queryOptions();

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

type ProjectEventsStreamedData = RouteStreamedQueryData<
	typeof streamApi.events.list
>;
expectType<Array<{ id: string; message: string }>>(
	null as unknown as ProjectEventsStreamedData,
);
expectType<never>(
	null as unknown as RouteStreamedQueryData<typeof queryApi.todos.get>,
);
expectType<never>(
	null as unknown as RouteStreamedQueryData<typeof invalidApi.ambiguousStream>,
);
