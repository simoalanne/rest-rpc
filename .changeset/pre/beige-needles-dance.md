---
"@rest-rpc/core": minor
"@rest-rpc/express": minor
"@rest-rpc/fastify": minor
"@rest-rpc/fetch": minor
"@rest-rpc/hono": minor
"@rest-rpc/nest": minor
"@rest-rpc/server": minor
"@rest-rpc/tanstack-query": minor
---

Redesign contract declaration around fluent, per-route builders. This is a
breaking beta change that replaces object-shaped route declarations with plain
contract trees composed from `route.get()`, `route.post()`, `route.sse()`, and
`route.ws()` builders.

Request locations are now declared through builder methods such as `.params()`,
`.query()`, `.headers()`, and `.body()`. These methods accept whole-location
schemas, allowing schema input and output generics to document client transport
values and validated handler values directly. `pathParams` has also been renamed
to `params` across contracts, grouped client inputs, handlers, and server adapter
boundaries.

Response statuses are now explicit. Use repeated `.response(status, schema)`
calls for ordinary responses and `.response(status)` for responses without a
body. Dedicated builder methods cover form, multipart, custom-content, streamed,
SSE, and WebSocket requests and responses. Shared route configuration now uses
`route.with()`, while route-specific OpenAPI metadata uses `.withOpenApi()`.

WebSocket declarations now consistently produce `{ type, message }` envelopes
through `.clientMessage()` and `.serverMessage()` instead of supporting multiple
competing message representations.

The redesign makes route declarations discoverable through autocomplete,
standardizes previously overlapping representations, and reduces the runtime
and type-level complexity required to normalize contracts. Clients, servers,
adapters, OpenAPI generation, TanStack Query helpers, tests, benchmarks, and
documentation have been updated to consume the new route representation.
