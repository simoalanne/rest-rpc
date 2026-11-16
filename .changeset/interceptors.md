---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Add interceptors: functions around everything an app or a client does for a request, for API key checks, logging, error reporting, metrics, retries or CORS. Pass them as `interceptors` to `createApp`, typed with `interceptor()` from `@rest-rpc/server`, or `@rest-rpc/server/node` for the Node `createApp`, and to `createClient`, typed with `clientInterceptor()`. They run first to last and see every response, error responses included.

- On the server, they receive every request, including ones that match no route, except those a route completed with `.static()` serves. `route` is the matched route's definition, with its path and `meta`, or `undefined` when no route matches. `next()` resolves with every response, `RouteError`s included, and rejects only with other thrown values, such as an `Error` a handler throws, which the app sends as `INTERNAL_SERVER_ERROR` when nothing catches it. A Node app also sends it when its interceptors finish without a response.
- A Fetch interceptor may call `next()` with another request for the matched route to read, or more than once, and receives the runtime's arguments after the request, such as Cloudflare's `env`, as `args`. A Node interceptor sets headers on the `ServerResponse` before calling `next()`.
- `errorResponse()` from `@rest-rpc/server` and `writeErrorResponse()` from `@rest-rpc/server/node` send the response of a `RouteError`, which clients decode as one, such as from a rate limit interceptor.
- On the client, they receive the Fetch `Request` and the called route, before the response is decoded.
