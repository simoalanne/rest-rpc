---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Content types are `content-type` headers instead of their own concept, and a body is JSON unless that header says otherwise. A route accepts the request content types its headers schema declares and answers others with `415`, and the client states the content type in the call's headers. A defined response declares its content type in its headers schema, and an inferred one sends the header passed to `respond()`. `.body()` and `.response()` take a schema, and a stream response takes `sse(schema)`. Media type records, the `contentType` option of `respond()`, the `contentType` of handler arguments, client calls and results, and the `BodyContent`, `KnownBodyContentType`, `MediaType` and `ResponseContentDefinition` types are removed. A `FormData` body is always sent as `multipart/form-data`, and OpenAPI reads content types from the declared `content-type` header.
