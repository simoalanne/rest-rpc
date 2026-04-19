# @contract-first-api/react-query

`@contract-first-api/react-query` wraps an `ApiClient` tree with React Query helpers. It keeps the same contract structure, but gives each contract React Query-friendly methods like `useQuery`, `useMutation`, `invalidate`, and `$fetch`.

## What you do with this package

Use it to:

- turn a typed API client into query and mutation hooks
- keep query keys aligned with the contract path
- invalidate or clear cache using the same contract tree
- inspect the original contract on each wrapped node through `$contract`
- post-process the generated adapter with `mapWrappedContracts`

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

For `GET` contracts, use query hooks:

```tsx
const health = api.health.get.useQuery();
const todos = api.todos.list.useQuery();
```

For non-`GET` contracts, use mutations:

```tsx
const createTodo = api.todos.create.useMutation({
  onSuccess: async () => {
    await api.todos.list.invalidate();
  },
});

await createTodo.mutateAsync({ title: "New item" });
```

## Useful helpers on each contract

Wrapped contracts expose the original contract through `$contract`, direct calls through `$fetch`, and the React Query helpers that match the default behavior for that route:

- `$contract` for the original contract definition, including `meta`
- `$fetch` for direct calls without hooks
- `$tryFetch` for `{ success, data | error }` style handling
- `useQuery` and `useSuspenseQuery` for `GET` routes
- `useMutation` for non-`GET` routes
- `invalidate` to refresh cached queries
- `clear` to remove cached queries
- `$getKey` to get the query key for a request
- `setData` to write into the cache
- `$reactQueryApi` to access both query and mutation helpers during custom transforms

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

## Post-processing the wrapped tree

Use `mapWrappedContracts` when you want to build your own adapter layer on top of the generated one.

```ts
import createAdapter, {
  mapWrappedContracts,
} from "@contract-first-api/react-query";

const baseApi = createAdapter(client.api, queryClient);

type ReactQueryMeta = {
  reactQuery?: {
    safe?: boolean;
  };
};

const customApi = mapWrappedContracts<ReactQueryMeta, typeof client.api>(
  baseApi,
  (node) =>
    node.$contract.meta?.reactQuery?.safe || node.$contract.method === "GET"
      ? node.$reactQueryApi
      : node,
);
```

That pattern is useful when contract metadata should influence how your app exposes or groups routes.
`$reactQueryApi` gives your transform access to the full helper surface even when the default adapter only exposes the query or mutation subset.

## Practical flow

In a React app, the usual order is:

1. Define contracts in shared code.
2. Build an `ApiClient` from those contracts.
3. Create a `QueryClient`.
4. Wrap the client with `createAdapter`.
5. Optionally post-process the wrapped tree with `mapWrappedContracts`.
6. Use the generated contract helpers inside components.

If your app already uses React Query, this package makes the contract tree feel like a native part of that setup.
