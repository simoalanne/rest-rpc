---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Add interceptors: functions around everything an app or a client does for a request, for API key checks, logging, metrics, retries or CORS. Pass them as `interceptors` to `createApp`, typed with `interceptor()` from `@rest-rpc/server`, or `@rest-rpc/server/node` for the Node `createApp`, and to `createClient`, typed with `clientInterceptor()`. They run first to last and see every response, error responses included.

- On the server, they receive every request, including ones that match no route, except those a route completed with `.static()` serves. `route` is the matched route's definition, with its path and `meta`, or `undefined` when no route matches. A Fetch interceptor may call `next()` with another request, which is routed again, or more than once. A Node interceptor sets headers on the `ServerResponse` before calling `next()`.
- On the client, they receive the Fetch `Request` and the called route, before the response is decoded.
