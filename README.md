# rest-rpc

REST-shaped APIs with function-shaped TypeScript.

`rest-rpc` lets you define HTTP routes in a shared TypeScript contract, then use
that contract to derive typed server handlers, typed fetch clients, TanStack Query
options, and OpenAPI documents.

The API stays REST-shaped. Everyday application code can feel like function
calls.

```ts
const todo = await api.todos.get.fetch({ id: "todo_1" });
```

That call is still a normal HTTP request:

```http
GET /todos/todo_1
```

## Packages

- `@rest-rpc/core`: contracts, fetch client, OpenAPI generation, core helpers.
- `@rest-rpc/express`: Express server adapter.
- `@rest-rpc/hono`: Hono server adapter.
- `@rest-rpc/fastify`: Fastify server adapter.
- `@rest-rpc/web`: Web `Request`/`Response` HTTP handler adapter.
- `@rest-rpc/next`: Next.js server/client adapter.
- `@rest-rpc/tanstack-query`: TanStack Query options and key helpers.

`@rest-rpc/server` contains shared adapter infrastructure and is mainly useful
for adapter authors.

## Design

- REST routes remain explicit in the contract.
- Handler and client calls use flattened request input.
- Responses are keyed by HTTP status.
- Server adapters are thin integrations with existing frameworks.
- Schema libraries, OpenAPI UI, middleware, auth, and app structure stay your choice.

## Documentation

[rest-rpc.dev](https://rest-rpc.dev)
