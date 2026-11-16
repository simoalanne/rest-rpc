---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

Add error formats, created with `errorFormat()`, to send error responses in another format than JSON `{ code, message, data? }`, such as RFC 9457 `application/problem+json`. Pass the same format as `errorFormat` to the server's options, `createClient` and `createOpenApiDocument()`. The server encodes the body `serialize` returns with the body codec for the format's content type, built-in errors and `NOT_FOUND` included. The client reads a `RouteError` from the fields `deserialize` returns, and OpenAPI documents the schema `openAPI` returns. Error bodies now go through the body codecs, so a custom `application/json` codec also encodes the default JSON errors.
