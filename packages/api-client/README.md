# @contract-first-api/api-client

Create a typed runtime HTTP client from a shared contract tree.

This package consumes contracts from `@contract-first-api/core` and builds a
client whose `api` property mirrors the contract tree. It can be used directly
in frontend code, server-to-server code, tests, or wrapped by
`@contract-first-api/react-query`.

## Install

```bash
pnpm add @contract-first-api/api-client
```

## Create A Client

```ts
import { ApiClient } from "@contract-first-api/api-client";
import { contracts } from "@example/shared";

const client = new ApiClient({
	baseUrl: process.env.API_BASE_URL,
	contracts,
	timeoutMs: 10_000,
});
```

`baseUrl` should point at the same route prefix you used on the backend. If your
Express routes were mounted with `routePrefix: "/api"`, include `/api` in the
client base URL.

## Calling Endpoints

`client.api` mirrors your contract tree.

```ts
const todos = await client.api.todos.list.fetch();

const created = await client.api.todos.create.fetch({
	title: "Write docs",
});
```

JSON contracts expose:

- `fetch(...)`: call the endpoint or throw on errors
- `tryFetch(...)`: call the endpoint and return a success/error result
- `$contract`: the original contract definition

## Request Arguments

For contracts without a request schema, call `fetch()` with no request object:

```ts
const health = await client.api.health.get.fetch();
```

For contracts with request schemas, pass one flat object containing the fields
from `body`, `query`, and `params`:

```ts
const todo = await client.api.todos.get.fetch({
	id: "todo_1",
	includeCompleted: true,
});
```

The client sorts those fields into the real HTTP request:

- `params` replace path segments like `/todos/:id`
- `query` fields become URL search params
- `body` fields are serialized as JSON

Request field names must be unique across `body`, `query`, and `params` in the
contract, so this flat input remains unambiguous.

## Fetch Options

Every call can receive fetch options that the client does not control.

```ts
await client.api.todos.list.fetch({
	cache: "no-store",
	credentials: "include",
	signal: abortController.signal,
});

await client.api.todos.create.fetch(
	{ title: "Write docs" },
	{ signal: abortController.signal },
);
```

The exported `FetchOptions` type is `RequestInit` without `method`, `body`, or
`headers`. The client owns those fields so they stay aligned with the contract
and configured default headers.

## Headers And Timeout

Use `setHeaders()` for headers that should be added to every request. The
callback can be sync or async, because headers often depend on async sources like refresh tokens.

```ts
client.setHeaders(async () => {
	const token = await getAccessToken();
	return {
		Authorization: `Bearer ${token}`,
	};
});
```

Headers are intentionally not part of the end-to-end contract model. They remain
normal HTTP/application concerns and are just passthroughs in the client.

Set `timeoutMs` when creating the client to abort requests that take too long:

```ts
const client = new ApiClient({
	baseUrl: process.env.API_BASE_URL,
	contracts,
	timeoutMs: 10_000,
});
```

If a per-request `signal` is also provided, the request is aborted when either
the per-request signal or the timeout signal aborts.

## Responses

Successful JSON responses are parsed and validated with the contract response
schema before they are returned.

```ts
const created = await client.api.todos.create.fetch({
	title: "Write docs",
});

created.id;
created.title;
```

If the backend returns a successful response that does not match the contract,
`fetch()` throws unknown client error.

For contracts without a response schema, `fetch()` resolves to `undefined`.

## Errors

If the backend responds with a non-2xx status, the client tries to parse the
response as one of the contract's known error schemas.

```ts
try {
	await client.api.todos.create.fetch({
		title: "Already exists",
	});
} catch (error) {
	// error is a known contract error or an unknown client error
}
```

Known errors are inferred from the contract. Unknown errors use this shape:

```ts
{
	code: "unknown",
	status: 500,
	message: "Internal Server Error"
}
```

## tryFetch And ApiResult

Use `tryFetch()` when you prefer a result object instead of exceptions.

```ts
const result = await client.api.todos.create.tryFetch({
	title: "Already exists",
});

if (result.success) {
	result.data;
} else {
	result.error;
}
```

The result shape is exported as `ApiResult`.

## Streaming

Contracts with `options: { mode: "stream" }` expose stream helpers instead of
JSON helpers.

```ts
const stream = await client.api.todos.events.stream({
	roomId: "room_1",
});

for await (const event of stream) {
	console.log(event);
}
```

Stream contracts expose:

- `stream(...)`: return an async iterable of validated NDJSON chunks
- `subscribe(...)`: call callbacks for each chunk and return an unsubscribe
  function
- `$contract`: the original contract definition

```ts
const unsubscribe = client.api.todos.events.subscribe(
	{ roomId: "room_1" },
	{
		onData(event) {
			console.log(event);
		},
		onError(error) {
			console.error(error);
		},
	},
);

unsubscribe();
```

If a stream chunk does not match the response schema, the stream throws an
unknown client error.

## How It Connects

- Define contracts with `@contract-first-api/core`.
- Mount those contracts on your backend with `@contract-first-api/express`.
- Create `new ApiClient({ baseUrl, contracts })` in any runtime with `fetch`.
- Use `client.api` directly, or wrap it with
  `@contract-first-api/react-query` for client-side React apps.
