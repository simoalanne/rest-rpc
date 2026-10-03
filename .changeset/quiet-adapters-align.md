---
"@rest-rpc/fetch": minor
"@rest-rpc/node": minor
---

Move adapter building blocks out of the package roots. `createFetchResponse` and `deserializeRequestBody` are now exported from `@rest-rpc/fetch/adapter` (replacing the `@rest-rpc/fetch/deserializeRequestBody` subpath), and `createRequestSignal`, `parseRequestTarget`, `createNodeResponseStream`, `writeNodeResponse`, `writeStreamResponse`, and `nodeBodyCodecs` from `@rest-rpc/node/adapter`. Both roots now export `InferServerHandler` like the other adapters, no longer export the `ImplicitResponse*`/`ServerFirst*` types, and `@rest-rpc/fetch` exports `FetchRouteHandlerResult`.
