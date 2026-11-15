---
"@rest-rpc/server": minor
---

The Node handlers from `@rest-rpc/server/node` read the Node request and write the Node response directly, instead of converting them to a Fetch `Request` and `Response`, which lowers per-request overhead. `onError` passed to them now receives the `IncomingMessage` instead of a Fetch `Request`. Stream responses send their headers before the first item on Node.

A route that has to read a request body that was already read, such as by a framework's body parser, now rejects on both runtimes, instead of responding with `MALFORMED_REQUEST_BODY`. Pass the parsed body as the `body` option.
