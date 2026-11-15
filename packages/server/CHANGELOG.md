# @rest-rpc/server

## 0.3.0

### Minor Changes

- 64804e5: Body deserializers receive an `IncomingBody` and the complete content type, as `deserialize(body, contentType)`, like serializers receive the content type. `IncomingBody` has `text()`, `json()`, `arrayBuffer()`, `blob()` and `body`, which Fetch requests and responses already have, so codecs that only use these work unchanged. Codecs that call other `Request` or `Response` members, such as `formData()`, must read the body with these instead, such as `new Response(await body.arrayBuffer(), { headers: { "content-type": contentType } }).formData()`. A codec used only on one side can no longer treat its source as a `Request` or `Response`.
- 64804e5: `serve` and `ServeOptions` are removed from `@rest-rpc/server/node`. It now exports `createApp`, which takes the route tree and returns a request listener for `http.createServer()`, so the server is started and configured with Node's own API: replace `serve(createApp(routes, options), { port })` with `createServer(createApp(routes, options)).listen(port)`, importing `createApp` from `@rest-rpc/server/node`. Its `context` function receives the `IncomingMessage`, and `notFound` writes to the `ServerResponse` and keeps the default response when it writes nothing.
- 64804e5: The Node handlers from `@rest-rpc/server/node` read the Node request and write the Node response directly, instead of converting them to a Fetch `Request` and `Response`, which lowers per-request overhead. `onError` passed to them now receives the `IncomingMessage` instead of a Fetch `Request`. Stream responses send their headers before the first item on Node.

A route that has to read a request body that was already read, such as by a framework's body parser, now rejects on both runtimes, instead of responding with `MALFORMED_REQUEST_BODY`. Pass the parsed body as the `body` option.

- 64804e5: `onError` receives a thrown defined error as it was thrown, instead of a copy with the defined status, validated `data` and headers, and the thrown error as `cause`. Its `cause` is now the one passed when throwing, so `errors.CODE({ cause })` reaches `onError` as `error.cause`. The response still uses the definition. A `new RouteError(code)` for a code the route defines keeps its own status in `onError`, which defaults to 400, while the defined status is sent. Defined errors with synchronous schemas are now resolved without a promise, and errors received from `call()` and the local client have no `cause`, like errors received over HTTP.
- 64804e5: `compileRoutes` is renamed `createRouteHandlers`, and its options type `CompileRoutesOptions` is renamed `CreateRouteHandlersOptions`. `createCatchAllHandler` now takes the route tree and the same options instead of compiled routes, in both `@rest-rpc/server` and `@rest-rpc/server/node`: replace `createCatchAllHandler(compileRoutes(routes, options))` with `createCatchAllHandler(routes, options)`.

### Patch Changes

- da819aa: A body's content type now always replaces a `content-type` passed in headers. Before, a passed header could override it, including the content type and multipart boundary the runtime sets for `FormData`. Routes with inferred responses now type `contentType` in client results as the received lowercase base media type, such as `text/csv` for `text/csv; charset=utf-8`. On routes with defined responses, `respond()` uses `contentType` as given, so a value that is not one of the defined media types throws.
- 359e26f: Serve `createApp` routes registered with Bun's native router through one promise per request instead of nested async wrappers, which lowers per-request overhead.
- 64804e5: `serializedBody()` takes its `headers` as a plain object of header names and values instead of any Fetch `HeadersInit`, and `SerializedBody.headers` is that object with lowercase names instead of a Fetch `Headers`. Replace `new Headers(...)` or header tuples passed to it with an object, and read the headers of a serialized body as `serialized.headers["content-type"]` instead of with `get()`.

The `body` handle option is used only when it is defined. Before, passing `body: undefined`, as a framework without a body parser leaves it, skipped reading the request body and validated `undefined` instead.

- 05ab0d0: Reject functions passed to `.static()` in types, which accepted them on routes without defined responses although static values are not called. Type errors now say why a promise, function or stream is not a valid static value instead of reporting a bare `never`. Static routes no longer check at runtime for values that bypass the types.
- da819aa: A `mountPath` that ends with a slash, such as `/api/`, now serves the routes like `/api`, instead of responding to every request with an `INTERNAL_SERVER_ERROR`. A `.prefix()` that ends with a slash is now a type error instead of a runtime error.

## 0.2.0

### Minor Changes

- 9a1a7da: Path params are written only as `:name`. `{name}` segments are no longer params, and the `paramSyntax` compile option is removed: compiled paths keep `:name`, and OpenAPI documents still use `{name}`.
- a3b6a2a: Header names with uppercase letters are a type error in `.headers()`, response and error `headers` schemas, `routeError()` and `respond()` headers. Received header names are lowercase, so those names never matched: required request headers failed validation, optional ones were always `undefined`, and response headers were typed but missing on the client. `globalHeaders` and `additionalHeaders` are not checked.
- a3b6a2a: Add `cookies` to `respond()` options, middleware responses and thrown errors. Each value is sent as its own `Set-Cookie` header. Fetch client results and `RouteError`s have the received values as `cookies` instead of a joined `set-cookie` header. Browsers hide `Set-Cookie` from `fetch`, so `cookies` is empty there.
- dfe3e97: Add `.static(value)`, which completes a route with the same response for every request, serialized once when the routes are compiled. Compiled Fetch routes have it as `staticResponse`, and `App.routes` entries are a function or that `Response`.

### Patch Changes

- 0948a36: Client calls may omit a `query` or `headers` object without required fields, a `body` whose schema accepts `undefined` on routes with one body media type, and a request without required fields. Before, only headers could be omitted, and only inside a passed request. TanStack Query `request` options and the local client follow the same rules, and local calls receive an omitted `query` or `headers` as `{}`, as over HTTP.
