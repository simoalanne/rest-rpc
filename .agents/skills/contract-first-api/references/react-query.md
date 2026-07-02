# @contract-first-api/react-query

Use this reference for React Query integration built on top of the API client.

## Purpose

`@contract-first-api/react-query` wraps a typed `ApiClient` tree with React
Query hooks and cache helpers.

It does not define contracts and does not create the base client itself.

## Main Setup

1. Create the `ApiClient`
2. Create a React Query `QueryClient`
3. Wrap `client.api` with `createAdapter()`

```ts
const client = new ApiClient({
	baseUrl: import.meta.env.VITE_API_BASE_URL,
	contracts,
});

export const queryClient = new QueryClient();
export const api = createAdapter(client.api, queryClient);
```

Provider setup:

```tsx
<QueryClientProvider client={queryClient}>
	<App />
</QueryClientProvider>
```

## Behavior By Contract Mode

- JSON contracts become query or mutation helpers
- raw contracts expose direct fetch helpers rather than query or mutation hooks
- stream contracts expose stream helpers
- websocket contracts expose connect helpers
- underlying api-client helpers are also available with a `$` prefix for direct
  non-hook usage

## Common Usage

- `useQuery()` for cacheable reads
- `useSuspenseQuery()` when the app already uses Suspense
- `useMutation()` for writes
- cache helpers like `invalidate()`, `setData()`, `clear()`, and `$getKey()`

The adapter supplies contract-derived query keys and fetch logic, but otherwise
follows normal TanStack Query usage patterns.

Query example:

```tsx
const todos = api.todos.list.useQuery();
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
	onSuccess: async () => {
		await api.todos.list.invalidate();
	},
});
```

Direct call:

```ts
const health = await api.health.get.$fetch();
```

## Practical Rules

- Build the React Query adapter from the already-created API client.
- For request-based queries, pass the same typed request object you would use
  with the API client.
- Use falsy request input when documented if you need to skip execution without
  manually setting `enabled: false`.
- Use `$fetch()` and `$tryFetch()` when you need direct client behavior instead
  of hooks.
- Treat the adapter like normal TanStack Query with contract-derived keys and
  fetch functions, not as a separate state-management model.

Cache helper example:

```ts
await api.todos.get.invalidate({ id: "todo_1" });

api.todos.get.setData({ id: "todo_1" }, (current) =>
	current ? { ...current, title: "Updated locally" } : current,
);
```

## Use This Package When

- wiring contract-backed data fetching into React components
- invalidating or updating cache entries tied to contract paths
- reasoning about which contract modes produce hooks vs direct helpers
