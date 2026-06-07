# @contract-first-api/react-query

`@contract-first-api/react-query` wraps an `ApiClient` tree with React Query helpers. It keeps the same contract structure, but gives each contract React Query-friendly methods like `useQuery`, `useMutation`, `invalidate`, and `$fetch`.

## What you do with this package

Use it to:

- turn a typed API client into query and mutation hooks
- keep query keys aligned with the contract path
- invalidate or clear cache using the same contract tree
- inspect the original contract on each wrapped node through `$contract`

## Basic setup

```ts
import { ApiClient } from "@contract-first-api/api-client";
import createAdapter from "@contract-first-api/react-query";
import { QueryClient } from "@tanstack/react-query";
import { contracts } from "@example/shared";

const client = new ApiClient({
  baseUrl: "http://localhost:3001/api",
  contracts,
});

export const queryClient = new QueryClient();
export const api = createAdapter(client.api, queryClient);
```

## How you use it in components

Use query hooks for read/cache workflows:

```tsx
const health = api.health.get.useQuery();
const todos = api.todos.list.useQuery();
```

Use mutations for imperative workflows:

```tsx
const createTodo = api.todos.create.useMutation({
  onSuccess: async () => {
    await api.todos.list.invalidate();
  },
});

await createTodo.mutateAsync({ title: "New item" });
```

## Useful helpers on each contract

Wrapped JSON contracts expose the original contract through `$contract`, direct calls through `$fetch`, and the full React Query helper surface:

- `$contract` for the original contract definition, including `meta`
- `$fetch` for direct calls without hooks
- `$tryFetch` for `{ success, data | error }` style handling
- `useQuery` and `useSuspenseQuery` for cacheable async state
- `useMutation` for imperative async actions
- `invalidate` to refresh cached queries
- `clear` to remove cached queries
- `$getKey` to get the query key for a request
- `setData` to write into the cache
- `$reactQueryApi` as an alias for the full helper surface

Examples:

```ts
await api.todos.list.invalidate();
const health = await api.health.get.$fetch();
const cachedHealthKey = api.health.get.$getKey();
```

`$fetch` also forwards fetch options to the underlying API client:

```ts
await api.health.get.$fetch({ cache: "no-store" });
await api.todos.create.$fetch(
  { title: "Ship docs" },
  { credentials: "include" },
);
```

## Practical flow

In a React app, the usual order is:

1. Define contracts in shared code.
2. Build an `ApiClient` from those contracts.
3. Create a `QueryClient`.
4. Wrap the client with `createAdapter`.
5. Use the generated contract helpers inside components.

If your app already uses React Query, this package makes the contract tree feel like a native part of that setup.
