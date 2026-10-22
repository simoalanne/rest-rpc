---
"@rest-rpc/server": minor
---

Add `createApp`, which returns a Fetch app that serves a route tree with `notFound` and `onError` fallbacks and a `context` option that seeds each request's context from a value or a sync or async function. The function also receives the arguments the runtime passes to `fetch` after the request, such as the `env` of Cloudflare Workers, with their types inferred from its parameters. Runtimes that serve a default-exported `fetch` handler serve it as is, and its `routes` property lets `Bun.serve()` route requests with Bun's native router. Add `serve` to `@rest-rpc/server/node`, which starts a `node:http` server for an app.
