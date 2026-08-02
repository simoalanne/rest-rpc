# @contract-first-api/react-query

Use this reference for React Query integration built from shared contracts.

## Purpose

`@contract-first-api/react-query` creates a contract-backed client shaped for
TanStack Query. It takes the same contract tree and client options as the core
client, plus a React Query `queryClient`.

## Main Setup

1. Create a React Query `QueryClient`.
2. Call `initReactQueryClient(contracts, { queryClient, baseUrl })`.
3. Render the app inside `QueryClientProvider`.

```ts
import { initReactQueryClient } from "@contract-first-api/react-query";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

export const api = initReactQueryClient(contracts, {
	queryClient,
	baseUrl: import.meta.env.VITE_API_BASE_URL,
});
```

Provider setup:

```tsx
<QueryClientProvider client={queryClient}>
	<App />
</QueryClientProvider>
```

## Behavior

- HTTP contracts expose `useQuery()`, `useSuspenseQuery()`, `useMutation()`,
  `setData()`, `invalidate()`, `clear()`, and `getKey()`.
- Hook data is the successful response envelope, so response bodies are under
  `data.body`.
- Hook errors can be declared non-success responses, undeclared client
  responses, or normal `Error` objects.
- WebSocket contracts are omitted from the React Query tree; use the core client
  directly for websocket connections.

## Common Usage

Query example:

```tsx
const todos = api.todos.list.useQuery();

return (
	<ul>
		{todos.data?.body.items.map((todo) => (
			<li key={todo.id}>{todo.title}</li>
		))}
	</ul>
);
```

Request-based query:

```tsx
const todo = api.todos.get.useQuery({
	id: "todo_1",
	includeCompleted: true,
});
```

Skip-until-input query:

```tsx
const search = api.todos.find.useQuery(
	searchTerm ? { query: searchTerm } : "",
);
```

Mutation example:

```tsx
const createTodo = api.todos.create.useMutation({
	onSuccess: async (response) => {
		if (response.status === 201) {
			console.log(response.body.id);
		}

		await api.todos.list.invalidate();
	},
});
```

Cache helper example:

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

## Practical Rules

- Build the React Query client from the shared contract tree and pass the same
  client options used by the core client.
- For request-based queries, pass the same typed request object you would use
  with the core client.
- Use falsy request input when you need to skip execution without manually
  setting `enabled: false`.
- Treat the adapter like normal TanStack Query with contract-derived keys and
  fetch functions.

## Use This Package When

- wiring contract-backed data fetching into React components
- invalidating or updating cache entries tied to contract paths
- reasoning about typed successful and non-successful response envelopes
