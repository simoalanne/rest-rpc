import {
	type HttpError,
	type InferClientResponse,
	type SseEvent,
} from "@rest-rpc/core";
import { route, type as schemaType } from "@rest-rpc/core";
import { createTanstackQueryUtils } from "@rest-rpc/tanstack-query";
import {
	type InfiniteData,
	type QueryClient,
	skipToken,
} from "@tanstack/query-core";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { expectAssignable, expectError, expectType } from "tsd";

declare const queryClient: QueryClient;

expectError(createTanstackQueryUtils({ baseUrl: "https://example.test" }));

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

const queryrestrpc = createTanstackQueryUtils(queryApi, {
	baseUrl: "https://example.test",
});

const validatedQueryApi = {
	test: route
		.get("/test/:id")
		.params(schemaType<{ id: string }>())
		.response(200, schemaType<{ id: string; title: string }>()),
};
const validatedQueryrestrpc = createTanstackQueryUtils(validatedQueryApi, {
	baseUrl: "https://example.test",
});
validatedQueryrestrpc.test.queryOptions({
	request: { params: { id: "test-1" } },
});

type FinalizedQueryData = InferClientResponse<typeof validatedQueryApi.test>;
expectType<{
	status: 200;
	body: { id: string; title: string };
	headers: Headers;
}>(undefined as unknown as FinalizedQueryData);

const getOptions = queryrestrpc.todos.get.queryOptions({
	request: {
		params: {
			id: "todo-1",
		},
	},
});
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
type GetTodoData = InferClientResponse<typeof queryApi.todos.get>;
const selectedGetOptions = queryrestrpc.todos.get.queryOptions({
	request: {
		params: {
			id: "todo-1",
		},
	},
	select(data) {
		expectAssignable<{
			status: 200;
			body: { id: string; title: string };
			headers: Headers;
		}>(data);
		return data.body.title;
	},
});
expectAssignable<(data: GetTodoData) => string>(
	selectedGetOptions.select as NonNullable<typeof selectedGetOptions.select>,
);
expectAssignable<Promise<GetTodoData>>(
	queryClient.fetchQuery(selectedGetOptions),
);

const selectedListOptions = queryrestrpc.todos.list.queryOptions({
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
	(data: InferClientResponse<typeof queryApi.todos.list>) => string[]
>(selectedListOptions.select as NonNullable<typeof selectedListOptions.select>);
expectAssignable<Promise<InferClientResponse<typeof queryApi.todos.list>>>(
	queryClient.fetchQuery(selectedListOptions),
);

// stream query options

// should expose stream routes as regular query data with raw async iterable bodies
const streamApi = {
	events: {
		list: route
			.get("/events")
			.streamResponse(200, schemaType<{ id: string; message: string }>()),
		byTopic: route
			.get("/events/by-topic")
			.query(schemaType<{ topic: string }>())
			.streamResponse(200, schemaType<{ id: string; message: string }>()),
	},
};

const streamrestrpc = createTanstackQueryUtils(streamApi, {
	baseUrl: "https://example.test",
});
type Event = SseEvent<{ id: string; message: string }>;

const streamOptions = streamrestrpc.events.list.queryOptions();
expectAssignable<
	Promise<{
		status: 200;
		body: AsyncIterable<Event>;
		headers: Headers;
	}>
>(queryClient.fetchQuery(streamOptions));
expectAssignable<
	| {
			status: 200;
			body: AsyncIterable<Event>;
			headers: Headers;
	  }
	| undefined
>(queryClient.getQueryData(streamOptions.queryKey));

const materializedStreamOptions = streamrestrpc.events.list.streamedQueryOptions();
expectAssignable<Promise<Event[]>>(
	queryClient.fetchQuery(materializedStreamOptions),
);
expectAssignable<Event[] | undefined>(
	queryClient.getQueryData(materializedStreamOptions.queryKey),
);
const inlineMaterializedStreamQuery = useQuery(
	streamrestrpc.events.list.streamedQueryOptions(),
);
expectType<UseQueryResult<Event[], HttpError | Error>>(
	inlineMaterializedStreamQuery,
);
streamrestrpc.events.list.streamedQueryOptions({ request: skipToken });
const inlineSkippedStreamQuery = useQuery(
	streamrestrpc.events.byTopic.streamedQueryOptions({ request: skipToken }),
);
expectType<UseQueryResult<Event[], HttpError | Error>>(
	inlineSkippedStreamQuery,
);

const selectedStreamOptions = streamrestrpc.events.list.streamedQueryOptions({
	select(events) {
		expectType<Event[]>(events);
		return events.length;
	},
});
expectAssignable<Promise<Event[]>>(
	queryClient.fetchQuery(selectedStreamOptions),
);
expectAssignable<Event[] | undefined>(
	queryClient.getQueryData(selectedStreamOptions.queryKey),
);
const inlineSelectedStreamQuery = useQuery(
	streamrestrpc.events.list.streamedQueryOptions({
		select(events) {
			expectType<Event[]>(events);
			return events.length;
		},
	}),
);
expectType<UseQueryResult<number, HttpError | Error>>(
	inlineSelectedStreamQuery,
);

const reducedStreamOptions = streamrestrpc.events.list.streamedQueryOptions({
	initialValue: "",
	reducer: (text, chunk) => {
		expectType<string>(text);
		expectType<Event>(chunk);
		return `${text}${chunk.data.message}`;
	},
});
expectAssignable<Promise<string>>(queryClient.fetchQuery(reducedStreamOptions));
expectAssignable<string | undefined>(
	queryClient.getQueryData(reducedStreamOptions.queryKey),
);
const inlineReducedStreamQuery = useQuery(
	streamrestrpc.events.list.streamedQueryOptions({
		initialValue: "",
		reducer: (text, chunk) => {
			expectType<string>(text);
			expectType<Event>(chunk);
			return `${text}${chunk.data.message}`;
		},
	}),
);
expectType<UseQueryResult<string, HttpError | Error>>(inlineReducedStreamQuery);

const arrayReducedStreamOptions = streamrestrpc.events.list.streamedQueryOptions({
	initialValue: [] as Event[],
	reducer: (events, chunk) => {
		expectType<Event[]>(events);
		expectType<Event>(chunk);
		return [...events, chunk];
	},
	refetchMode: "replace",
});
expectAssignable<Promise<Event[]>>(
	queryClient.fetchQuery(arrayReducedStreamOptions),
);
expectAssignable<Event[] | undefined>(
	queryClient.getQueryData(arrayReducedStreamOptions.queryKey),
);

const selectedReducedStreamOptions = streamrestrpc.events.list.streamedQueryOptions({
	initialValue: new Map<string, string>(),
	reducer: (messages, chunk) => {
		expectType<Map<string, string>>(messages);
		expectType<Event>(chunk);
		return new Map(messages).set(chunk.data.id, chunk.data.message);
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
const inlineSelectedReducedStreamQuery = useQuery(
	streamrestrpc.events.list.streamedQueryOptions({
		initialValue: new Map<string, string>(),
		reducer: (messages, chunk) => {
			expectType<Map<string, string>>(messages);
			expectType<Event>(chunk);
			return new Map(messages).set(chunk.data.id, chunk.data.message);
		},
		select(messages) {
			expectType<Map<string, string>>(messages);
			return [...messages.values()];
		},
	}),
);
expectType<UseQueryResult<string[], HttpError | Error>>(
	inlineSelectedReducedStreamQuery,
);

// conditional query input

// should accept skipToken for conditional request input
const optionalId: string | undefined = "todo-1";

const skippedOptions = queryrestrpc.todos.get.queryOptions({
	request: optionalId ? { params: { id: optionalId } } : skipToken,
	queryKey: ["todos", "disabled"],
	staleTime: 100,
});
expectAssignable<
	typeof skipToken | NonNullable<typeof getOptions.queryFn> | undefined
>(skippedOptions.queryFn);

// request and fetch options

// should combine request input and TanStack options in one object
queryrestrpc.todos.get.queryOptions({
	request: {
		params: {
			id: "todo-1",
		},
	},
	retry: false,
});
queryrestrpc.todos.get.queryOptions({
	request: {
		params: {
			id: "todo-1",
		},
	},
	fetchOptions: { cache: "reload", credentials: "same-origin" },
	gcTime: 1_000,
});
expectError(
	queryrestrpc.todos.get.queryOptions({
		request: { params: { id: "todo-1" } },
		fetchOptions: { signal: AbortSignal.abort() },
	}),
);

// should use the same global header providers and request inference as the fetch client
const globalHeadersApi = {
	secure: route
		.headers(schemaType<{ authorization: string }>())
		.input(schemaType<{ title: string }>())
		.output(schemaType<{ id: string }>()),
};
const globalHeadersrestrpc = createTanstackQueryUtils(globalHeadersApi, {
	baseUrl: "https://example.test",
	globalHeaders: {
		authorization: async () => "Bearer token",
		"x-client-version": 2,
	},
});
globalHeadersrestrpc.secure.queryOptions({
	request: { title: "Write type tests" },
});
globalHeadersrestrpc.secure.mutationOptions({
	onSuccess(_data, variables) {
		expectType<{ title: string }>(variables);
	},
});

const optionalGlobalHeadersrestrpc = createTanstackQueryUtils(globalHeadersApi, {
	baseUrl: "https://example.test",
	globalHeaders: {
		authorization: (): string | undefined => undefined,
	},
});
expectError(
	optionalGlobalHeadersrestrpc.secure.queryOptions({
		request: { title: "Write type tests" },
	}),
);

// should preserve route-specific Fetch options while query utils own signals
const contentTypeApi = {
	imports: route
		.input(schemaType<{ value: string }>(), {
			contentType: ["text/plain", "text/markdown"],
		})
		.output(schemaType<{ id: string }>()),
};
const contentTyperestrpc = createTanstackQueryUtils(contentTypeApi, {
	baseUrl: "https://example.test",
});
contentTyperestrpc.imports.queryOptions({
	request: { value: "hello" },
	fetchOptions: {
		additionalHeaders: { "x-trace-id": "trace-1", "x-retry": 1 },
		contentType: "text/plain",
	},
});
expectError(
	contentTyperestrpc.imports.queryOptions({ request: { value: "hello" } }),
);
expectError(
	contentTyperestrpc.imports.queryOptions({
		request: { value: "hello" },
		fetchOptions: { contentType: "application/json" },
	}),
);
contentTyperestrpc.imports.queryOptions({
	request: skipToken,
	fetchOptions: { contentType: "text/plain" },
});
contentTyperestrpc.imports.mutationOptions({
	fetchOptions: {
		additionalHeaders: { "x-trace-id": "trace-1" },
		contentType: "text/markdown",
		signal: AbortSignal.abort(),
	},
});
expectError(contentTyperestrpc.imports.mutationOptions());
contentTyperestrpc.imports.infiniteQueryOptions({
	request: (value) => {
		expectType<string>(value);
		return { value };
	},
	initialPageParam: "hello",
	getNextPageParam: () => undefined,
	fetchOptions: { contentType: "text/plain" },
});
expectError(
	contentTyperestrpc.imports.infiniteQueryOptions({
		request: (value: string) => ({ value }),
		initialPageParam: "hello",
		getNextPageParam: () => undefined,
	}),
);
contentTyperestrpc.imports.infiniteQueryOptions({
	request: skipToken,
	initialPageParam: "hello",
	getNextPageParam: () => undefined,
	fetchOptions: { contentType: "text/plain" },
});

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

const mutationrestrpc = createTanstackQueryUtils(mutationApi, {
	baseUrl: "https://example.test",
});

mutationrestrpc.todos.create.mutationOptions({
	fetchOptions: {
		cache: "no-store",
	},
	onSuccess(data, variables) {
		expectAssignable<{
			status: 201;
			body: { id: string; title: string };
			headers: Headers;
		}>(data);
		expectType<{ body: { title: string } }>(variables);
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

const pagerestrpc = createTanstackQueryUtils(pageApi, {
	baseUrl: "https://example.test",
});

type TodoPageResponse = InferClientResponse<typeof pageApi.todos.page>;
type TodoPageParam = string | undefined;
type TodoInfiniteData = InfiniteData<TodoPageResponse, TodoPageParam>;

type TodoPageResponseShape = {
	status: 200;
	body: {
		items: Array<{ id: string; title: string }>;
		nextCursor?: string;
	};
	headers: Headers;
};

const infiniteOptions = pagerestrpc.todos.page.infiniteQueryOptions({
	request: (cursor: TodoPageParam) => ({
		query: { cursor, status: "open", limit: 50 },
	}),
	initialPageParam: undefined,
	fetchOptions: {
		cache: "no-store",
	},
	getNextPageParam(lastPage, _allPages, lastPageParam) {
		expectAssignable<TodoPageResponseShape>(lastPage);
		expectType<TodoPageParam>(lastPageParam);
		return lastPage.body.nextCursor;
	},
});

pagerestrpc.todos.page.infiniteQueryOptions({
	request: skipToken,
	initialPageParam: undefined as TodoPageParam,
	getNextPageParam: () => undefined,
});
expectError(
	pagerestrpc.todos.page.infiniteQueryOptions({
		request: (cursor: TodoPageParam) => ({
			query: { cursor, status: "open", limit: 50 },
		}),
		initialPageParam: 0,
		getNextPageParam: () => undefined,
	}),
);

queryClient.fetchInfiniteQuery(infiniteOptions).then((data) => {
	expectType<TodoInfiniteData>(data);
	expectType<Array<TodoPageResponse>>(data.pages);
	expectType<Array<TodoPageParam>>(data.pageParams);
	expectAssignable<TodoPageResponseShape>(data.pages[0]);
});

const cachedInfiniteData = queryClient.getQueryData(infiniteOptions.queryKey);
if (cachedInfiniteData) {
	expectType<TodoInfiniteData>(cachedInfiniteData);
	expectType<Array<TodoPageResponse>>(cachedInfiniteData.pages);
	expectType<Array<TodoPageParam>>(cachedInfiniteData.pageParams);
	expectAssignable<TodoPageResponseShape>(cachedInfiniteData.pages[0]);
}

// query keys

// should generate reusable typed keys for QueryClient cache operations
const key = queryrestrpc.todos.get.queryKey({
	params: {
		id: "todo-1",
	},
});
expectAssignable<readonly unknown[]>(key);
queryClient.invalidateQueries({ queryKey: key });
queryClient.removeQueries({ queryKey: key });
queryClient.setQueryData(key, (current) => {
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
const listKey = queryrestrpc.todos.list.queryKey();
queryClient.invalidateQueries({ queryKey: listKey });
queryClient.setQueryData(listKey, (current) => current);

const mutationKey = mutationrestrpc.todos.create.mutationKey();
expectAssignable<readonly unknown[]>(mutationKey);
expectAssignable<readonly unknown[]>(
	mutationrestrpc.todos.create.mutationOptions().mutationKey,
);

// invalid calls

// should reject malformed request input, options placement, and infinite options
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
	mixed: {
		list: queryApi.todos.list,
	},
};

const invalidrestrpc = createTanstackQueryUtils(invalidApi, {
	baseUrl: "https://example.test",
});

expectError(invalidrestrpc.todos.get.queryOptions());
expectError(invalidrestrpc.todos.get.queryOptions({ id: "todo-1", extra: true }));
expectError(
	invalidrestrpc.todos.get.queryOptions({
		request: {
			params: {
				id: "todo-1",
			},
		},
		fetchOptions: { nope: true },
	}),
);
expectError(invalidrestrpc.todos.get.queryOptions({ retry: false }));
expectError(
	invalidrestrpc.todos.list.queryOptions({
		request: { params: { id: "todo-1" } },
	}),
);
invalidrestrpc.todos.list.queryOptions({ retry: false });
invalidrestrpc.todos.list.queryOptions({ request: skipToken });
expectError(invalidrestrpc.todos.get.queryKey());
expectError(
	invalidrestrpc.todos.get.queryKey({
		extra: true,
		params: {
			params: {
				id: "todo-1",
			},
		},
	}),
);
expectError(invalidrestrpc.todos.list.queryKey({ queryKey: ["todos", "list"] }));
expectError(
	invalidrestrpc.todos.get.streamedQueryOptions({
		request: { params: { id: "todo-1" } },
	}),
);
invalidrestrpc.normalStream.streamedQueryOptions();
expectError(invalidrestrpc.ambiguousStream.streamedQueryOptions());
expectError(
	invalidrestrpc.todos.page.infiniteQueryOptions({
		initialPageParam: { status: "open", limit: 50 },
		getNextPageParam: () => undefined,
	}),
);
expectError(
	invalidrestrpc.todos.page.infiniteQueryOptions({
		request: () => ({ status: "open", limit: 50 }),
		initialPageParam: undefined,
		getNextPageParam: () => undefined,
	}),
);
expectError(
	invalidrestrpc.todos.page.infiniteQueryOptions({
		initialRequest: { query: { status: "open", limit: 50 } },
		getNextRequest: () => undefined,
	}),
);
invalidrestrpc.todos.list.infiniteQueryOptions({
	initialPageParam: {},
	getNextPageParam: () => undefined,
});
invalidrestrpc.mixed.list.queryOptions();

// shorthand route utils

const shorthandApi = {
	todos: {
		get: route.output(schemaType<{ id: string; title: string }>()),
		events: route.streamOutput(schemaType<{ id: string; message: string }>()),
		add: route
			.input(schemaType<{ title: string }>())
			.output(schemaType<{ id: string; title: string }>()),
	},
};

const shorthandrestrpc = createTanstackQueryUtils(shorthandApi, {
	baseUrl: "https://example.test",
});

const shorthandGetOptions = shorthandrestrpc.todos.get.queryOptions({
	retry(_failureCount, error) {
		expectType<HttpError | Error>(error);
		return false;
	},
	select(data) {
		expectType<{ id: string; title: string }>(data);
		expectError(data.status);
		return data.title;
	},
});
expectType<Promise<{ id: string; title: string }>>(
	queryClient.fetchQuery(shorthandGetOptions),
);

const shorthandStreamOptions = shorthandrestrpc.todos.events.queryOptions();
expectType<Promise<AsyncIterable<Event>>>(
	queryClient.fetchQuery(shorthandStreamOptions),
);
const shorthandMaterializedStreamOptions =
	shorthandrestrpc.todos.events.streamedQueryOptions();
expectType<Promise<Event[]>>(
	queryClient.fetchQuery(shorthandMaterializedStreamOptions),
);

shorthandrestrpc.todos.add.mutationOptions({
	onSuccess(data, variables) {
		expectType<{ id: string; title: string }>(data);
		expectType<{ title: string }>(variables);
		expectError(data.status);
	},
	onError(error) {
		expectType<HttpError | Error>(error);
	},
});
shorthandrestrpc.todos.add.queryOptions({ request: { title: "Todo" } });
expectError(
	shorthandrestrpc.todos.add.queryOptions({ request: { body: { title: "Todo" } } }),
);
expectError(shorthandrestrpc.todos.add.queryOptions());
expectError(shorthandrestrpc.todos.get.streamedQueryOptions());
