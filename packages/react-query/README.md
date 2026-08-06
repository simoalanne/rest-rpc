# @contract-first-api/react-query

Create API-contract-backed client shaped for TanStack Query.

The setup is the same as the core client: pass the shared API contract and the
same client options such as `baseUrl`, headers, and timeouts. React Query also
needs a `queryClient`, and the returned API exposes hooks and cache helpers.

## Install

```bash
pnpm add @contract-first-api/react-query @tanstack/react-query
```

## Create The React Query Client

```ts
// api.ts
import { initReactQueryClient } from "@contract-first-api/react-query";
import { apiContract } from "@example/shared";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

export const api = initReactQueryClient(apiContract, {
	queryClient,
	baseUrl: import.meta.env.VITE_API_BASE_URL,
	getHeaders: () => ({
		Authorization: `Bearer ${getAuthToken()}`,
	}),
});
```

React Query uses the same client options as `initClient()`. The client
serializes typed request input and parses declared server responses as the
contract's response output type. Set `validateResponses: true` when you want the
client to additionally validate declared HTTP responses before React Query
receives them.

## Add The Provider

Use React Query's `QueryClientProvider` at the root of your React app.

```tsx
// main.tsx
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
import { queryClient } from "./api.ts";

ReactDOM.createRoot(document.querySelector("#app")!).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</React.StrictMode>,
);
```

After that, import the generated `api` object inside components.

## Queries

Use `useQuery()` for cacheable reads.

```tsx
import { api } from "./api.ts";

export const TodoList = () => {
	const todos = api.todos.list.useQuery();

	if (todos.isLoading) return <p>Loading...</p>;
	if (todos.error) return <p>Failed to load todos</p>;

	return (
		<ul>
			{todos.data?.body.items.map((todo) => (
				<li key={todo.id}>{todo.title}</li>
			))}
		</ul>
	);
};
```

Hook data is the successful response envelope, not only the body. That means
you can still narrow on `data.status` when a route declaration declares multiple
successful responses.

For routes with request schemas, pass the typed request object first:

```tsx
const todo = api.todos.get.useQuery({
	id: "todo_1",
	includeCompleted: true,
});
```

For request-based queries, pass a falsy value when you want to skip execution:

```tsx
const search = api.todos.find.useQuery(
	searchTerm ? { query: searchTerm } : "",
);
```

Use `useSuspenseQuery()` if your app already uses Suspense:

```tsx
const health = api.health.get.useSuspenseQuery();
```

## Normal React Query Options

The generated hooks accept the same options you would pass to `useQuery`,
`useSuspenseQuery`, and `useMutation`. Query keys and fetch functions come from
the API contract.

```tsx
const todos = api.todos.list.useQuery({
	staleTime: 30_000,
	refetchOnWindowFocus: false,
	select: (response) => response.body.items,
});

const createTodo = api.todos.create.useMutation({
	onSuccess: async () => {
		await api.todos.list.invalidate();
	},
});
```

## Mutations

Use `useMutation()` for writes.

```tsx
const createTodo = api.todos.create.useMutation({
	onSuccess: async (response) => {
		if (response.status === 201) {
			console.log(response.body.id);
		}

		await api.todos.list.invalidate();
	},
});

await createTodo.mutateAsync({
	title: "Write docs",
});
```

The mutation input is inferred from the route request schema. The mutation
result is inferred from the route's successful response entries.

## Helper Types

Hooks infer their types in components. Use route helper types when data, errors,
or mutation variables need to cross component, hook, test, or module boundaries.

```ts
import type {
	InferRouteMutationVariables,
	InferRouteQueryData,
	InferRouteQueryError,
} from "@contract-first-api/react-query";
import { apiContract } from "@example/shared";

export type TodoListData = InferRouteQueryData<
	typeof apiContract.todos.list
>;

export type CreateTodoVariables = InferRouteMutationVariables<
	typeof apiContract.todos.create
>;

export type CreateTodoError = InferRouteQueryError<
	typeof apiContract.todos.create
>;
```

## Cache Helpers

Each HTTP route declaration exposes cache helpers tied to the same query key
format used by its hooks.

```ts
await api.todos.list.invalidate();

api.todos.list.setData((current) =>
	current
		? {
				...current,
				body: {
					items: current.body.items,
				},
			}
		: current,
);

api.todos.list.clear();

const key = api.todos.list.getKey();
```

For request-based queries, pass the same request object:

```ts
await api.todos.get.invalidate({ id: "todo_1" });

api.todos.get.setData({ id: "todo_1" }, (current) =>
	current && current.status === 200
		? {
				...current,
				body: {
					...current.body,
					title: "Updated locally",
				},
			}
		: current,
);
```

The generated query key is based on the route key path inside the API contract,
plus the request object when one exists.

## Errors

Hook errors are one of:

- a declared non-successful response envelope from the route
- an undeclared response envelope from the core client
- a normal `Error`

```tsx
const createTodo = api.todos.create.useMutation({
	onError(error) {
		if ("status" in error && error.status === 409) {
			console.log(error.body.code);
		}
	},
});
```

## WebSocket Routes

WebSocket routes are omitted from the React Query API. Use the core client
directly for websocket connections.

## How It Connects

- Define `apiContract` with `@contract-first-api/core`.
- Create a `QueryClient`.
- Call `initReactQueryClient(apiContract, { queryClient, baseUrl })`.
- Render your app inside React Query's `QueryClientProvider`.

This package is only needed for React apps that want TanStack Query integration.
Use `initClient()` from `@contract-first-api/core` for direct client calls.
