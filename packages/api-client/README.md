# @contract-first-api/api-client

`@contract-first-api/api-client` turns a shared contract tree into a typed runtime client. It gives you one `fetch` function per contract, with request and response types inferred from the contract.

## What you do with this package

Use it to:

- create a typed client from shared contracts
- call contracts with the same request shape the backend expects
- validate responses against the contract response schema
- centralize base URL, default headers, and HTTP error handling
- forward per-request fetch options when you need them

## Basic usage

```ts
import { ApiClient } from "@contract-first-api/api-client";
import { contracts } from "@example/shared";

const client = new ApiClient({
  baseUrl: "http://localhost:3001/api",
  contracts,
});
```

After that, `client.api` mirrors the contract tree:

```ts
await client.api.health.get.fetch();
await client.api.todos.list.fetch();
await client.api.todos.create.fetch({ title: "Write docs" });
```

## How requests work

You pass one object containing the fields defined in the contract. The client sorts those fields into `params`, `query`, and `body` for the real HTTP request.

For contracts with no request schema, just call `fetch()` with no request object:

```ts
const health = await client.api.health.get.fetch();
```

## Passing fetch options per request

Each client method also accepts fetch options:

- for requestless contracts: `fetch(options?)`
- for contracts with input: `fetch(request, options?)`

The client still controls the request `method`, serialized `body`, and merged default headers.

## Error handling and defaults

You can configure the client once when you create it:

```ts
const client = new ApiClient({
  baseUrl: "http://localhost:3001/api",
  contracts,
  timeoutMs: 10_000,
  onHttpError: ({ contract, error }) => {
    console.error("Request failed", contract, error.response.status);
  },
});

// Headers are set via a callback as they are often dynamic and cannot be known at client creation time:
client.setHeaders(async () => {
  const token = await getAuthToken();
  return { Authorization: `Bearer ${token}` };
});
```

## Place in the stack

In a typical app, this package sits between the shared contracts and the React Query adapter:

1. Import the shared `contracts`.
2. Build `new ApiClient({ baseUrl, contracts })`.
3. Use `client.api` directly, or wrap it with `@contract-first-api/react-query`.

If you are not using React Query, this package is enough on its own for typed API calls.
