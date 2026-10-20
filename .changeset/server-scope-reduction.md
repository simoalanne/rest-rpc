---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Narrow the server side to Fetch and Node HTTP runtimes that integrate with any framework's router.

- `@rest-rpc/fetch` moves to the `@rest-rpc/server` root and `@rest-rpc/node` to `@rest-rpc/server/node`. Import `route`, `implement` and `InferServerHandler` from the root. Augment `DefaultContext` on `@rest-rpc/server`.
- On Node, `requestValidationErrorHandler` and `responseValidationErrorHandler` receive a Fetch `Request` and return a Fetch `Response`, like on Fetch. `NodeRequestBody` is removed; Node codecs are the same `BodyCodec`s as on Fetch and the client.
- The default binary codec also sends `ReadableStream` and async iterable bodies.
- `@rest-rpc/express`, `@rest-rpc/hono`, `@rest-rpc/fastify` and `@rest-rpc/nest` are removed. Register compiled routes on the framework's router instead; see the Frameworks docs page.
- `createRouteHandler(tree, options)` is replaced by `createCatchAllHandler(compileRoutes(tree, options))`. `compileRoutes` returns `{ method, path, handle }` routes for registering on an existing router, with `handle` reading params from the request URL. The `paramSyntax` option rewrites path params to `:name` or `{name}`.
- Handlers and catch-all handlers accept `{ context }` to seed the request context before middleware runs.
- Handlers and middleware no longer receive the native `request`, `req` or `res`, and the `DefaultRequest` interface is removed. Pass native values through `context` when needed.
- Routing uses rou3. Static segments take precedence over params, one trailing slash is ignored, and repeated param names in one path are rejected.
- `BodyCodec` and `BodyDeserializer` are no longer generic. Custom deserializers receive a Fetch `Request` on the server, including on Node,. An error thrown while deserializing now responds with `400`.
