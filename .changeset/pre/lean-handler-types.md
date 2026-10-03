---
"@rest-rpc/server": minor
"@rest-rpc/express": minor
"@rest-rpc/fastify": minor
"@rest-rpc/fetch": minor
"@rest-rpc/hono": minor
"@rest-rpc/nest": minor
"@rest-rpc/node": minor
---

Rename the adapter `RouteHandler` type to `InferServerHandler` to match the `Infer*` style of the core helpers. `InferServerHandler` now expects a plain return value for `.output()` routes instead of a status envelope. Remove `RouteRequest` and `RouteErrors` from the adapter roots: use `InferServerRequest` for the validated request, `Parameters<InferServerHandler<typeof route>>[0]` for the full handler argument, and `Extract<InferServerResponse<typeof route>, { status: 404 }>` for specific status responses.
