---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
"@rest-rpc/tanstack-query": minor
"@rest-rpc/express": minor
"@rest-rpc/fastify": minor
"@rest-rpc/fetch": minor
"@rest-rpc/hono": minor
"@rest-rpc/nest": minor
"@rest-rpc/node": minor
---

Type helpers accept a route tree as well as a single route and infer a matching tree of types, so one exported type can be indexed per route: `InferServerRequest<typeof routes>["todos"]["create"]`. This applies to `InferClientRequest`, `InferClientResponse`, `InferServerRequest`, `InferServerResponse`, the adapter `InferServerHandler`, and the TanStack Query `Infer*` helpers. Add `InferClientStreamData` to `@rest-rpc/core`, which infers the `data` of each event received from a streaming route without the `SseEvent` wrapper.
