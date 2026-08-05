# Core API Client

Use this reference for building and using typed runtime clients with
`@contract-first-api/core`.

## Purpose

`initClient()` creates a typed client tree that mirrors the shared contract
tree.

## Main Setup

```ts
import { initClient } from "@contract-first-api/core";

const api = initClient(contract, {
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

The client `baseUrl` should point to the deployment origin. Shared path
prefixes belong in the API contract with `router(..., { pathPrefix })`,
so clients and servers consume the same normalized route paths.

## Request Shape

The client tree mirrors the contract tree. Requests use one flat object:

- `params` replace path segments
- `query` becomes URL search params
- `body` becomes JSON unless it is declared with `customBody(...)`

Omitting `request.body` is shorthand for no request body. If a route declares
`request.body: noBody()` and has no params or query, client calls are
options-only, the same as routes without a `request` block.

```ts
const todo = await api.todos.get.fetch({
	id: "todo_1",
	includeCompleted: true,
});
```

Custom bodies keep the same flat `params` and `query` fields, but send the
whole request body through the `body` field. The client sets the declared
`Content-Type`. For `application/json` custom bodies, it stringifies the body;
other body values are passed to `fetch` as-is.

```ts
const response = await api.images.inspect.fetchResponse({
	imageId: "img_1",
	body: file,
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

Routes with multiple successful responses only expose `fetchResponse()` so
callers must handle the status.

## WebSocket Routes

WebSocket routes expose `openConnection()`.

```ts
const socket = api.chat.connect.openConnection();

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
