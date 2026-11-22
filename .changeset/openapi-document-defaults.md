---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
---

`createOpenApiDocument()` needs no options. `info.title` defaults to `"API"` and `info.version` to `"0.0.0"`. `info`, `servers`, `tags` and `externalDocs` accept any other fields of their OpenAPI objects, such as `contact` or `license` in `info`, and copy them to the document as they are. The document's other top-level fields, `security`, `externalDocs` and `x-` extensions, are now copied to the document like `servers`, `components` and `tags`.

Every operation gets an `operationId` by default, its route's key path in the route tree, such as `posts.get`, the name of its client call. `.openAPI({ operationId })` still sets another, and an empty value leaves it out.

OpenAPI documents are more complete:

- Every path segment is documented as a parameter, as a string when the params schema doesn't convert it, so documents without a schema converter stay valid.
- A parameter's or response header's `description` and `deprecated` are set on the parameter or header itself, and response headers are marked `required` when their schema requires them.
- `accept` and `authorization` header parameters are left out like `content-type`, since OpenAPI ignores them. Use `security` for credentials.

Documents target OpenAPI 3.2, and `openapi` defaults to `3.2.1` instead of `3.1.0`. Streams are documented with an `itemSchema` that describes each event, with the event data's schema as the `contentSchema` of its JSON `data`, and responses and errors without a description no longer get an empty one. `$self` and `jsonSchemaDialect` are copied to the document like the other top-level fields.

A request body without a declared `content-type` is documented as `application/json` and `multipart/form-data`, the content types the server accepts for it.
