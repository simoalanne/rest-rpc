import type { StandardSchemaV1 } from "@rest-rpc/core";
import { router } from "@rest-rpc/core/contract";
import {
	type InferRouteMutationVariables,
	type InferRouteQueryData,
	initReactQueryClient,
} from "@rest-rpc/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { expectAssignable, expectError, expectType } from "tsd";

declare const todoSchema: StandardSchemaV1<
	{ id: string; title: string },
	{ id: string; title: string }
>;
declare const todoListSchema: StandardSchemaV1<
	Array<{ id: string; title: string }>,
	Array<{ id: string; title: string }>
>;
declare const todoParamsSchema: StandardSchemaV1<
	{ id: string },
	{ id: string }
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

const rq = initReactQueryClient(api, {
	baseUrl: "https://example.test",
	queryClient,
});

const getResult = rq.todos.get.useQuery({ id: "todo-1" });
expectAssignable<
	| { status: 200; body: { id: string; title: string }; headers: Headers }
	| undefined
>(getResult.data);

rq.todos.list.useQuery({ staleTime: 100 });
rq.todos.list.useQuery({ queryKey: ["todos", "custom"] });
// useQuery accepts falsy request input to disable request-based queries.
rq.todos.get.useQuery("", { queryKey: ["todos", "disabled"], staleTime: 100 });
rq.todos.get.useSuspenseQuery(
	{ id: "todo-1" },
	{ queryKey: ["todos", "todo-1"] },
);
rq.todos.create.useMutation({
	onSuccess(data, variables) {
		expectAssignable<{
			status: 201;
			body: { id: string; title: string };
			headers: Headers;
		}>(data);
		expectType<{ title: string }>(variables);
	},
});
rq.todos.get.getKey({ id: "todo-1" }, { queryKey: ["todos", "todo-1"] });
rq.todos.get.invalidate({ id: "todo-1" }, { queryKey: ["todos", "todo-1"] });
rq.todos.get.clear({ id: "todo-1" }, { queryKey: ["todos", "todo-1"] });
rq.todos.get.setData({ id: "todo-1" }, (current) => current, {
	queryKey: ["todos", "todo-1"],
});
rq.todos.list.getKey({ queryKey: ["todos", "list"] });
rq.todos.list.invalidate({ queryKey: ["todos", "list"] });
rq.todos.list.clear({ queryKey: ["todos", "list"] });
rq.todos.list.setData((current) => current, { queryKey: ["todos", "list"] });

// Suspense queries cannot be disabled with falsy request input.
expectError(rq.todos.get.useQuery());
expectError(rq.todos.get.useSuspenseQuery(""));
// Routes without request input treat the first argument as query options.
expectError(rq.todos.list.useQuery({ id: "todo-1" }));
// WebSocket routes are intentionally omitted from the React Query client.
expectError(rq.events);

type GetTodoData = InferRouteQueryData<typeof api.todos.get>;
expectAssignable<{
	status: 200;
	body: { id: string; title: string };
	headers: Headers;
}>(null as unknown as GetTodoData);

type CreateTodoVariables = InferRouteMutationVariables<typeof api.todos.create>;
expectType<{ title: string }>(null as unknown as CreateTodoVariables);
