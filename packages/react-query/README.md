# @contract-first-api/react-query

`@contract-first-api/react-query` wraps an `ApiClient` tree with React Query helpers. It keeps the same contract structure, but gives each endpoint React Query-friendly methods like `useQuery`, `useMutation`, `invalidate`, and `$fetch`.

## What you do with this package

Use it to:

- turn a typed API client into query and mutation hooks
- keep query keys aligned with the contract path
- invalidate or clear cache using the same endpoint tree
- still access a plain `$fetch` method when needed

## Basic setup

```ts
import { ApiClient } from "@contract-first-api/api-client";
import createAdapter from "@contract-first-api/react-query";
import { QueryClient } from "@tanstack/react-query";
import { contracts } from "@example/shared";

const client = new ApiClient({
  baseUrl: "http://localhost:3001/api",
  endpoints: contracts,
});

export const queryClient = new QueryClient();
export const api = createAdapter(client.api, queryClient);
```

## How you use it in components

For `GET` endpoints, use query hooks:

```tsx
const health = api.health.get.useQuery();
const todos = api.todos.list.useQuery();
```

For non-`GET` endpoints, use mutations:

```tsx
const createTodo = api.todos.create.useMutation({
  onSuccess: async () => {
    await api.todos.list.invalidate();
  },
});

await createTodo.mutateAsync({ title: "New item" });
```

This is a common usage pattern for form submissions and list refreshes.

## Useful helpers on each endpoint

Depending on the HTTP method, wrapped endpoints expose helpers like:

- `$fetch` for direct calls without hooks
- `$tryFetch` for `{ success, data | error }` style handling
- `useQuery` and `useSuspenseQuery` for `GET` routes
- `useMutation` for non-`GET` routes
- `invalidate` to refresh cached queries
- `clear` to remove cached queries
- `$getKey` to get the query key for a request
- `setData` to write into the cache

Example:

```ts
await api.todos.list.invalidate();
const health = await api.health.get.$fetch();
```

## Practical flow

In a React app, the usual order is:

1. Define contracts in shared code.
2. Build an `ApiClient` from those contracts.
3. Create a `QueryClient`.
4. Wrap the client with `createAdapter`.
5. Use the generated endpoint helpers inside components.

If your app already uses React Query, this package makes the contract tree feel like a native part of that setup.
