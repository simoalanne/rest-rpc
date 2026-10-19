---
"@rest-rpc/server": minor
---

Add `call(route, request?, options?)`, which runs a route's middleware and handler locally and returns the validated, unserialized response. The request and response have the same types as a fetch client call. `signal`, `contentType`, `lastEventId`, and a partial `context` can be passed in the options. Add `initLocalClient(routes)`, which mirrors a route tree with leaves that take the same arguments as `call()`. Re-export `InferClientRequest` and `InferClientResponse`.
