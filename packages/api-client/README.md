# @contract-first-api/api-client

`@contract-first-api/api-client` turns a shared contract tree into a typed runtime client. It gives you one `fetch` function per endpoint, with request and response types inferred from the contract.

## What you do with this package

Use it to:

- create a typed client from shared contracts
- call endpoints with the same request shape the backend expects
- validate responses against the contract response schema
- centralize base URL, default headers, and HTTP error handling

## Basic usage

```ts
import { ApiClient } from "@contract-first-api/api-client";
import { contracts } from "@example/shared";

const client = new ApiClient({
  baseUrl: "http://localhost:3001/api",
  endpoints: contracts,
});
```

After that, `client.api` mirrors the contract tree:

```ts
await client.api.health.get.fetch();
await client.api.todos.list.fetch();
await client.api.todos.create.fetch({ title: "Write docs" });
```

## Request shapes come from the contract

You pass a single object containing the fields defined in the contract. The client sorts those fields into `params`, `query`, and `body` for the actual HTTP request.

Example:

```ts
await client.api.todos.create.fetch({
  title: "Ship the example",
});
```

For endpoints with no request schema, just call `fetch()` with no request object:

```ts
const health = await client.api.health.get.fetch();
```

## Error handling and defaults

You can configure the client once when you create it:

```ts
const client = new ApiClient({
  baseUrl: "http://localhost:3001/api",
  endpoints: contracts,
  defaultHeaders: {
    Authorization: "Bearer token",
  },
  timeoutMs: 10_000,
  onHttpError: ({ endpoint, error }) => {
    console.error("Request failed", endpoint, error.response.status);
  },
});
```

## Practical place in the stack

In a typical app, this package sits between the shared contracts and the React Query adapter:

1. Import the shared `contracts`.
2. Build `new ApiClient({ baseUrl, endpoints: contracts })`.
3. Use `client.api` directly, or wrap it with `@contract-first-api/react-query`.

If you are not using React Query, this package is enough on its own for typed API calls.
