---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Dynamic path segments without a `.params()` schema are typed and passed to handlers as string params, and OpenAPI documents them as strings. Routes that declare params without dynamic path segments throw, and the client throws on a missing path param instead of sending `undefined`.
