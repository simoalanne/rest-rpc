---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
"@rest-rpc/tanstack-query": minor
---

Declare body schemas per media type. `.body(schema)` and `.response(schema)` still declare JSON bodies. Other and multiple media types are declared with a record keyed by base media type, such as `.body({ "application/json": json, "multipart/form-data": form })` or `.response({ "text/csv": csv }, { status: 200 })`. The `contentType` option of `.body()` and `.response()` is removed. Media type keys must be lowercase and without parameters. Repeated `.body()` calls append schemas per media type.

Requests and responses are unions discriminated by `contentType`. Handlers receive the selected request media type with a narrowed `body`, and return a `contentType` that selects the response schema. It may be omitted when a status declares one media type. Client calls select the request media type with `contentType` in the request object instead of the call options; it is required only when a route declares several. Client and local call results include the received `contentType`.

A request with an undeclared media type, or without a content type for a route that declares several, is rejected with `415`. OpenAPI documents get a schema per media type. `extractContract` keeps request body media types as `request.body` with empty schema lists.

`FetchOptionsFor` is replaced by `FetchOptions`. `BodyContentType`, `BodyOptions`, `BodylessResponseOptions`, and `StreamResponseOptions` are removed in favor of `BodyContent`, `MediaType`, and `ResponseOptions`. `fetchOptions` in TanStack Query options is always optional.

A `text/event-stream` response is always an SSE stream whose schema validates each item, and response declarations no longer have a `kind`. `.streamResponse(schema)` is the same as `.response({ "text/event-stream": schema })`, so a status can offer a stream next to other media types. Handlers can no longer send pre-framed SSE text as a `text/event-stream` body; a `text/event-stream` envelope must have an async iterable body.
