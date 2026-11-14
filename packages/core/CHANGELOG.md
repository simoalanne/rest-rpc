# @rest-rpc/core

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- 36640ac: `InferClientRequest`, `InferClientResponse`, `InferClientError`, and `InferClientStreamData` accept the type of a client route function or client tree, such as `typeof client.todos.get`, in addition to routes. Request types inferred from a client already make headers that its `globalHeaders` provides optional.
- 9a1a7da: Path params are written only as `:name`. `{name}` segments are no longer params, and the `paramSyntax` compile option is removed: compiled paths keep `:name`, and OpenAPI documents still use `{name}`.
- a3b6a2a: Header names with uppercase letters are a type error in `.headers()`, response and error `headers` schemas, `routeError()` and `respond()` headers. Received header names are lowercase, so those names never matched: required request headers failed validation, optional ones were always `undefined`, and response headers were typed but missing on the client. `globalHeaders` and `additionalHeaders` are not checked.
- a3b6a2a: Add `cookies` to `respond()` options, middleware responses and thrown errors. Each value is sent as its own `Set-Cookie` header. Fetch client results and `RouteError`s have the received values as `cookies` instead of a joined `set-cookie` header. Browsers hide `Set-Cookie` from `fetch`, so `cookies` is empty there.

### Patch Changes

- 0948a36: Client calls may omit a `query` or `headers` object without required fields, a `body` whose schema accepts `undefined` on routes with one body media type, and a request without required fields. Before, only headers could be omitted, and only inside a passed request. TanStack Query `request` options and the local client follow the same rules, and local calls receive an omitted `query` or `headers` as `{}`, as over HTTP.
