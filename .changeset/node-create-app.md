---
"@rest-rpc/server": minor
---

`serve` and `ServeOptions` are removed from `@rest-rpc/server/node`. It now exports `createApp`, which takes the route tree and returns a request listener for `http.createServer()`, so the server is started and configured with Node's own API: replace `serve(createApp(routes, options), { port })` with `createServer(createApp(routes, options)).listen(port)`, importing `createApp` from `@rest-rpc/server/node`. Its `context` function receives the `IncomingMessage`, and `notFound` writes to the `ServerResponse` and keeps the default response when it writes nothing.
