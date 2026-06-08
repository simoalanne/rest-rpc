# @contract-first-api/react-query

Wrap a typed `ApiClient` tree with React Query hooks and cache helpers.

This package does not define contracts or make a client by itself. It consumes
the `client.api` tree from `@contract-first-api/api-client`, keeps the same
shape, and replaces each contract node with React Query-friendly helpers. JSON
contracts become query/mutation helpers, stream contracts expose stream helpers,
and websocket contracts expose connect helpers.

## Install

```bash
pnpm add @contract-first-api/react-query @tanstack/react-query
```

## Create The API Adapter

Create the base API client, create a React Query `QueryClient`, then wrap
`client.api` with `createAdapter()`.

```ts
// api.ts
import { ApiClient } from "@contract-first-api/api-client";
import createAdapter from "@contract-first-api/react-query";
import { contracts } from "@example/shared";
import { QueryClient } from "@tanstack/react-query";

const client = new ApiClient({
	baseUrl: import.meta.env.VITE_API_BASE_URL,
	contracts,
});

export const queryClient = new QueryClient();
export const api = createAdapter(client.api, queryClient);
```

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

After that, import the adapted `api` object inside components.

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
			{todos.data?.items.map((todo) => (
				<li key={todo.id}>{todo.title}</li>
			))}
		</ul>
	);
};
```

For contracts with request schemas, pass the typed request object first:

```tsx
const todo = api.todos.get.useQuery({
	id: "todo_1",
	includeCompleted: true,
});
```

For request-based queries, you can pass falsy value as an alternative to options.enabled: false when you don't want the query to run:

```tsx
const search = api.todos.find.useQuery(
	searchTerm ? { query: searchTerm } : "",
);
```

Use `useSuspenseQuery()` if you're already using Suspense in your app and want to throw promises instead of handling loading and error states manually.

```tsx
const health = api.health.get.useSuspenseQuery();
```

## Normal React Query Options

The generated hooks are thin wrappers around TanStack Query. You use the same
options you would pass to `useQuery`, `useSuspenseQuery`, and `useMutation`; the
adapter only supplies the `queryKey`, `queryFn`, and `mutationFn` from the
contract.

```tsx
const todos = api.todos.list.useQuery({
	staleTime: 30_000,
	refetchOnWindowFocus: false,
	select: (data) => data.items,
});

const createTodo = api.todos.create.useMutation({
	onSuccess: async () => {
		await api.todos.list.invalidate();
	},
});
```

You can also use TanStack Query directly whenever that is a better fit. The
adapter exposes `$getKey()` and `$fetch()` so custom query code can still share
the same contract-derived key and fetch behavior.

When it comes to questions like which hook to use, which options to pass, how to handle loading and error states, etc., use the official Tanstack Query documentation and community resources. The adapter does not change how React Query works, it just allows to use syntax that is consistent with the contract definitions and API client.

```tsx
import { useQuery } from "@tanstack/react-query";

const todos = useQuery({
	queryKey: api.todos.list.$getKey(),
	queryFn: () => api.todos.list.$fetch(),
	staleTime: 30_000,
});
```

## Mutations

Use `useMutation()` for mutations.

```tsx
const createTodo = api.todos.create.useMutation({
	onSuccess: async () => {
		await api.todos.list.invalidate();
	},
});

await createTodo.mutateAsync({
	title: "Write docs",
});
```

The mutation input is inferred from the contract request schema. The mutation
result is inferred from the contract response schema.

## Cache Helpers

Each wrapped JSON contract exposes cache helpers tied to the same query key
format used by its hooks.

```ts
await api.todos.list.invalidate();

api.todos.list.setData((current) => ({
	items: current?.items ?? [],
}));

api.todos.list.clear();

const key = api.todos.list.$getKey();
```

For request-based queries, pass the same request object:

```ts
await api.todos.get.invalidate({ id: "todo_1" });

api.todos.get.setData({ id: "todo_1" }, (current) =>
	current ? { ...current, title: "Updated locally" } : current,
);
```

The generated query key is based on the contract path inside the contract tree,
plus the request object when one exists.

## Direct Calls

Wrapped JSON contracts also expose direct calls to the underlying API client.

```ts
const health = await api.health.get.$fetch();

const result = await api.todos.create.$tryFetch({
	title: "Write docs",
});
```

`$fetch()` accepts the same request and fetch-options arguments as the API
client.

```ts
await api.health.get.$fetch({ cache: "no-store" });

await api.todos.create.$fetch(
	{ title: "Write docs" },
	{ signal: abortController.signal },
);
```

## Streaming Contracts

Streaming contracts are not wrapped as React Query queries. They expose the
stream helpers from the API client with `$` prefixes.

```tsx
import { useEffect } from "react";

useEffect(() => {
	return api.todos.events.$subscribe({
		onData(event) {
			console.log(event);
		},
		onError(error) {
			console.error(error);
		},
	});
}, []);
```

Stream contract nodes expose:

- `$contract`
- `$stream`
- `$subscribe`

## WebSocket Contracts

WebSocket contracts are not wrapped as React Query queries. They expose the
connect helper from the API client with a `$` prefix.

```tsx
import { useEffect, useRef } from "react";

export const Discussion = () => {
	const socketRef = useRef<ReturnType<typeof api.discuss.room.$connect> | null>(
		null,
	);

	useEffect(() => {
		const socket = api.discuss.room.$connect();
		socketRef.current = socket;

		const offMessage = socket.onMessage((result) => {
			if (!result.success) {
				return;
			}

			console.log(result.data);
		});

		return () => {
			offMessage();
			socket.close();
			socketRef.current = null;
		};
	}, []);

	return (
		<button
			type="button"
			onClick={() => {
				socketRef.current?.send({
					type: "message",
					text: "Hello",
				});
			}}
		>
			Send
		</button>
	);
};
```

WebSocket contract nodes expose:

- `$contract`
- `$connect`

## How It Connects

- Define contracts with `@contract-first-api/core`.
- Create `new ApiClient({ baseUrl, contracts })` with
  `@contract-first-api/api-client`.
- Wrap `client.api` with `createAdapter(client.api, queryClient)`.
- Render your app inside React Query's `QueryClientProvider`.

This package is only needed for React apps that want React Query integration.
You can use `@contract-first-api/api-client` directly without it.
