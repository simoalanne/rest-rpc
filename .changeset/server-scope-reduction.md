---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Narrow the server side to Fetch and Node HTTP runtimes that integrate with any framework's router.

- `@rest-rpc/fetch` and `@rest-rpc/node` move to `@rest-rpc/server/fetch` and `@rest-rpc/server/node`. `route`, `implement` and `InferServerHandler` are the same on both. Augment `DefaultContext` on `@rest-rpc/server`.
- `@rest-rpc/express`, `@rest-rpc/hono`, `@rest-rpc/fastify` and `@rest-rpc/nest` are removed. Register compiled routes on the framework's router instead; see the Frameworks docs page.
- `createRouteHandler(tree, options)` is replaced by `createCatchAllHandler(compileRoutes(tree, options))`. `compileRoutes` returns `{ method, path, handle }` routes for registering on an existing router, with `handle` reading params from the request URL. The `paramSyntax` option rewrites path params to `:name` or `{name}`.
- Handlers and catch-all handlers accept `{ context }` to seed the request context before middleware runs.
- Handlers and middleware no longer receive the native `request`, `req` or `res`, and the `DefaultRequest` interface is removed. Pass native values through `context` when needed.
- Routing uses rou3. Static segments take precedence over params, one trailing slash is ignored, and repeated param names in one path are rejected.
- `BodyCodec` and `BodyDeserializer` are no longer generic. Custom deserializers receive a Fetch `Request` on the server, including on Node, and are subject to `requestBodyLimit`. An error thrown while deserializing now responds with `400`.
