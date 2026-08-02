# Core API Client

Use this reference for building and using typed runtime clients with
`@contract-first-api/core`.

## Purpose

`initClient()` creates a typed client tree that mirrors the shared contract
tree.

## Main Setup

```ts
import { initClient } from "@contract-first-api/core";

const api = initClient(contracts, {
	baseUrl: process.env.API_BASE_URL,
	fetchOptions: {
		cache: "no-store",
	},
	getHeaders: async () => ({
		Authorization: `Bearer ${await getAccessToken()}`,
	}),
	timeoutMs: 10_000,
});
```

## Base URL Rule

The client `baseUrl` must include the same route prefix used by the backend. If
the server uses `routePrefix: "/api"`, the client base URL should point to that
`/api` root.

## Request Shape

The client tree mirrors the contract tree. Requests use one flat object:

- `params` replace path segments
- `query` becomes URL search params
- `body` becomes JSON

```ts
const todo = await api.todos.get.fetch({
	id: "todo_1",
	includeCompleted: true,
});
```

Raw contracts keep the same flat `params` and `query` fields, but use an
explicit `rawBody` field for the request payload.

```ts
const response = await api.images.inspect.fetchResponse({
	imageId: "img_1",
	rawBody: file,
});
```

## Responses

Every HTTP contract exposes `fetchResponse()`.

```ts
const response = await api.todos.create.fetchResponse({
	title: "Write docs",
});

if (response.declared && response.status === 201) {
	console.log(response.body.id);
}

if (response.declared && response.status === 409) {
	console.error(response.body.code);
}
```

`fetchResponse()` returns:

- `{ declared: true, status, body }` for a response declared in the contract
- `{ declared: false, status, body }` for an undeclared backend response

If a contract has exactly one successful response, it also exposes `fetch()`.
`fetch()` returns the successful body directly and throws when the request does
not produce a declared successful response.

```ts
const todos = await api.todos.list.fetch();
console.log(todos.items);
```

Contracts with multiple successful responses only expose `fetchResponse()` so
callers must handle the status.

## WebSocket Contracts

WebSocket contracts expose `connect()` and `tryConnect()`.

```ts
const socket = api.chat.connect.connect();

socket.send({
	text: "hello",
});

socket.onMessage((result) => {
	if (result.success) {
		console.log(result.data);
	}
});
```

## Headers And Timeout

- `getHeaders` adds headers to every request.
- `timeoutMs` aborts slow requests.
- Per-call fetch options can pass `signal` and other `fetch` options.

## Use This Package When

- creating frontend or server-to-server clients from the shared contract tree
- debugging request flattening or path parameter substitution
- aligning client base URLs with backend routing
- handling declared vs undeclared responses
