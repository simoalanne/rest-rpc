# @rest-rpc/core

## 0.3.0

### Minor Changes

- 64804e5: Body deserializers receive an `IncomingBody` and the complete content type, as `deserialize(body, contentType)`, like serializers receive the content type. `IncomingBody` has `text()`, `json()`, `arrayBuffer()`, `blob()` and `body`, which Fetch requests and responses already have, so codecs that only use these work unchanged. Codecs that call other `Request` or `Response` members, such as `formData()`, must read the body with these instead, such as `new Response(await body.arrayBuffer(), { headers: { "content-type": contentType } }).formData()`. A codec used only on one side can no longer treat its source as a `Request` or `Response`.
- 64804e5: `serializedBody()` takes its `headers` as a plain object of header names and values instead of any Fetch `HeadersInit`, and `SerializedBody.headers` is that object with lowercase names instead of a Fetch `Headers`. Replace `new Headers(...)` or header tuples passed to it with an object, and read the headers of a serialized body as `serialized.headers["content-type"]` instead of with `get()`.

The `body` handle option is used only when it is defined. Before, passing `body: undefined`, as a framework without a body parser leaves it, skipped reading the request body and validated `undefined` instead.

### Patch Changes

- da819aa: The client passes response bodies to codecs directly. A response body that fails while it is read now rejects like a body that cannot be decoded, with the read error as `cause`.
- da819aa: The client skips event stream frames without data, such as keepalive comments, and drops an incomplete last frame, instead of ending the stream with an error.
- da819aa: A body's content type now always replaces a `content-type` passed in headers. Before, a passed header could override it, including the content type and multipart boundary the runtime sets for `FormData`. Routes with inferred responses now type `contentType` in client results as the received lowercase base media type, such as `text/csv` for `text/csv; charset=utf-8`. On routes with defined responses, `respond()` uses `contentType` as given, so a value that is not one of the defined media types throws.
- da819aa: A `mountPath` that ends with a slash, such as `/api/`, now serves the routes like `/api`, instead of responding to every request with an `INTERNAL_SERVER_ERROR`. A `.prefix()` that ends with a slash is now a type error instead of a runtime error.

## 0.2.0

### Minor Changes

- 36640ac: `InferClientRequest`, `InferClientResponse`, `InferClientError`, and `InferClientStreamData` accept the type of a client route function or client tree, such as `typeof client.todos.get`, in addition to routes. Request types inferred from a client already make headers that its `globalHeaders` provides optional.
- 9a1a7da: Path params are written only as `:name`. `{name}` segments are no longer params, and the `paramSyntax` compile option is removed: compiled paths keep `:name`, and OpenAPI documents still use `{name}`.
- a3b6a2a: Header names with uppercase letters are a type error in `.headers()`, response and error `headers` schemas, `routeError()` and `respond()` headers. Received header names are lowercase, so those names never matched: required request headers failed validation, optional ones were always `undefined`, and response headers were typed but missing on the client. `globalHeaders` and `additionalHeaders` are not checked.
- a3b6a2a: Add `cookies` to `respond()` options, middleware responses and thrown errors. Each value is sent as its own `Set-Cookie` header. Fetch client results and `RouteError`s have the received values as `cookies` instead of a joined `set-cookie` header. Browsers hide `Set-Cookie` from `fetch`, so `cookies` is empty there.

### Patch Changes

- 0948a36: Client calls may omit a `query` or `headers` object without required fields, a `body` whose schema accepts `undefined` on routes with one body media type, and a request without required fields. Before, only headers could be omitted, and only inside a passed request. TanStack Query `request` options and the local client follow the same rules, and local calls receive an omitted `query` or `headers` as `{}`, as over HTTP.
