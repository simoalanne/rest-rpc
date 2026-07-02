# @contract-first-api/api-client

Use this reference for building and using typed runtime clients.

## Purpose

`@contract-first-api/api-client` creates a typed client whose `api` property
mirrors the contract tree.

## Main Setup

Create an `ApiClient` with:

- `contracts`
- `baseUrl`
- optional `fetchOptions`
- optional `timeoutMs`

```ts
const client = new ApiClient({
	baseUrl: process.env.API_BASE_URL,
	contracts,
	timeoutMs: 10_000,
});
```

Common calls:

```ts
const todos = await client.api.todos.list.fetch();
```

```ts
const todo = await client.api.todos.get.fetch({
	id: "todo_1",
	includeCompleted: true,
});
```

```ts
const created = await client.api.todos.create.fetch({
	title: "Write docs",
});
```

## Base URL Rule

The client `baseUrl` must include the same route prefix used by the backend.

If the server uses `routePrefix: "/api"`, the client base URL should point to
that `/api` root.

## Request Shape

`client.api` mirrors the contract tree.

JSON and raw contracts expose:

- `fetch(...)`
- `tryFetch(...)`
- `$contract`

Requests use one flat object:

- `params` replace path segments
- `query` becomes URL search params
- `body` becomes JSON

Raw contracts keep the same flat `params` and `query` fields, but use an
explicit `rawBody` field for the request payload.

```ts
await client.api.images.upload.fetch({
	imageId: "img_1",
	rawBody: file,
});
```

Websocket contract call:

```ts
const socket = await client.api.chat.connect();

socket.send({
	text: "hello",
});

socket.onMessage((message: { text: string }) => {
	console.log(message.text);
});
```

## Responses And Errors

- Successful JSON responses are validated against the contract response schema.
- Contracts without a response schema resolve to `undefined`.
- Known contract errors are inferred from the contract.
- Unknown failures use the client's unknown error shape.

Use `tryFetch()` when you want a success/error result object instead of thrown
exceptions. This is often easier to handle than catching unknown thrown errors
because the result is already narrowed to the contract's known error shapes.

```ts
const result = await client.api.todos.create.tryFetch({
	title: "Write docs",
});

if (!result.ok) {
	console.error(result.error);
}
```

## Headers And Timeout

Use `setHeaders()` for headers that should be added to every request.

`timeoutMs` aborts slow requests. For stream contracts, the timeout applies
until the stream is established.

```ts
client.setHeaders(async () => ({
	Authorization: `Bearer ${await getAccessToken()}`,
}));
```

## Use This Package When

- creating frontend or server-to-server clients from the shared contract tree
- debugging request flattening or path parameter substitution
- aligning client base URLs with backend routing
- handling known vs unknown errors
