# @rest-rpc/server

## 0.8.1

### Patch Changes

- cf60813: Match routes with a built-in matcher instead of `rou3`, so `@rest-rpc/server` has no dependencies outside rest-rpc. Matching behaves as before.

## 0.8.0

### Minor Changes

- 7496228: Add `createToolsFromRoutes()`, which turns a route tree into tools shaped like MCP tools: a definition and a `call` function, to register with an MCP server or an agent framework. Tool calls run through the routes' validation and middleware without HTTP. `mergeTools()` merges tools into two, one that finds tools and one that calls a tool by name, so a model can use every route of a large API.

## 0.7.0

### Minor Changes

- c04340d: `implement()` requires a contract route to define its responses. A contract route without `.response()` has no handler to infer its response from, so its handler used to accept any value and the client typed the call as `never`. Its `handler()` is now a type error that says to add `.response()`, which can be a response without a body, such as `.response({ status: 204 })`.
- c04340d: `implement()` rejects a contract tree whose top-level keys include `use` or `$context` with a type error. The implementer's methods use those names, so such a route or group used to be replaced by the method.
- c04340d: `createOpenApiDocument()` needs no options. `info.title` defaults to `"API"` and `info.version` to `"0.0.0"`. `info`, `servers`, `tags` and `externalDocs` accept any other fields of their OpenAPI objects, such as `contact` or `license` in `info`, and copy them to the document as they are. The document's other top-level fields, `security`, `externalDocs` and `x-` extensions, are now copied to the document like `servers`, `components` and `tags`.

Every operation gets an `operationId` by default, its route's key path in the route tree, such as `posts.get`, the name of its client call. `.openAPI({ operationId })` still sets another, and an empty value leaves it out.

OpenAPI documents are more complete:

- Every path segment is documented as a parameter, as a string when the params schema doesn't convert it, so documents without a schema converter stay valid.
- A parameter's or response header's `description` and `deprecated` are set on the parameter or header itself, and response headers are marked `required` when their schema requires them.
- `accept` and `authorization` header parameters are left out like `content-type`, since OpenAPI ignores them. Use `security` for credentials.

Documents target OpenAPI 3.2, and `openapi` defaults to `3.2.1` instead of `3.1.0`. Streams are documented with an `itemSchema` that describes each event, with the event data's schema as the `contentSchema` of its JSON `data`, and responses and errors without a description no longer get an empty one. `$self` and `jsonSchemaDialect` are copied to the document like the other top-level fields.

A request body without a declared `content-type` is documented as `application/json` and `multipart/form-data`, the content types the server accepts for it.

- c04340d: A defined response or error without a headers schema sends the headers the handler and middleware set. They used to be dropped, so a `content-type` set with `respond()`, or a header such as `cache-control` added by middleware, was not sent on routes that define their responses. With a headers schema, its output is still what's sent, so a schema that strips unknown keys sends only the headers it declares.

### Patch Changes

- c04340d: Add a `default` condition next to `import` in each package's `exports`, so resolvers that don't use the `import` condition, such as some bundler plugins, find the entry points.
- c04340d: Type the `path` of an intercepted route as always set. Client and server interceptors receive the path resolved from the route tree, also for routes that take their path from their key, so `route.path` no longer needs an `undefined` check.

## 0.6.0

### Minor Changes

- bddf9bc: Throw `BodySerializationError` from the built-in codecs' `serialize` for a value they don't encode. It extends `TypeError` and carries the `mediaType` the value was serialized for, the value kinds the codec `expected`, and the kind of value it `received`. The JSON codec still throws the errors of `JSON.stringify`.
- f150152: Rename the client types to match the other `Client` types: `ApiClientFor` is now `ClientFor`, `ApiClientOptions` is now `CreateClientOptions`, and `ApiClientRouteValue` is now `ClientRouteValue`.
- bddf9bc: Custom codecs take precedence over the built-in ones for every media type they match, patterns included. A codec such as `bodyCodec(/.*/, ...)` now also handles `application/json`, `application/x-www-form-urlencoded` and `multipart/form-data`, which used to stay with the built-in codecs because they list them as strings. Within the custom codecs, a media type listed as a string is still selected before patterns.

A codec may now send another base media type in the `content-type` of a `serializedBody()` instead of throwing. The receiving side decodes the body with the codec of the content type it receives, while route types and OpenAPI documents still show the declared one.

- 0e5ba74: Accept `FormData` request bodies without a declared content type. A route whose headers schema declares no `content-type` now decodes `multipart/form-data` as well as JSON, so `route.body(type<FormData>())` works with a client that sends `FormData` and no `content-type` header, which Fetch sets with the generated boundary. Such routes no longer answer multipart requests with `415`, so a route that shouldn't take `FormData` rejects it with its body schema.
- bddf9bc: Server-Sent Events and error responses never use body codecs, on either side. The server writes event streams without passing them through the codecs, and the client reads error bodies with the built-in codecs only, so a custom codec that matches `application/json`, such as a catch-all pattern, no longer breaks defined errors.

## 0.5.0

### Minor Changes

- 3d6507c: Export the built-in body codecs from `@rest-rpc/core` and `@rest-rpc/server` as `jsonCodec`, `urlEncodedCodec`, `formDataCodec`, `textCodec` and `binaryCodec`, so a custom codec can call one for the values it doesn't handle. Their operations are both defined and typed with what they return, such as `Promise<FormData>` from `formDataCodec.deserialize()`.

`IncomingBody` has a `formData()` method, which the Node server implements too, so a codec reads a multipart body with `await body.formData()` on every runtime. An object implementing `IncomingBody` must add it.

- 99c0b66: Remove `createLocalClient()` and the `LocalClient` type. To call an app in process with the same behavior as over HTTP, such as in tests, pass its `fetch` to `createClient(routes, { fetch: app.fetch })`. `createClient` and `ApiClientOptions` are now exported from `@rest-rpc/server` too. To call one route without HTTP, use `call()`.

### Patch Changes

- b38ff78: Run interceptors for `OPTIONS` requests to `app.routes`, as `app.fetch` does, so an interceptor answers CORS preflights when Bun serves `app.routes` without `app.fetch`. Bun answered them with its own `404` before. A preflight no interceptor answers is sent `NOT_FOUND`.
- 5deb097: Re-export the rest of `@rest-rpc/core` except `route` from `@rest-rpc/server`, so server code and its tests import only `@rest-rpc/server`: `clientInterceptor()`, `extractContract()` and the `AbsolutePath`, `ApiClientFor`, `ApiClientRouteValue`, `BodyDeserializer`, `BodySerializer`, `BuiltInBodyCodec`, `ClientHeaders`, `ClientInterceptor`, `Contract`, `FetchLike`, `FetchOptions`, `IncomingBody`, `InferClientStreamData`, `ResponseOptions`, `RouteDefinition` and `SseResponse` types.
- d3b9f08: Accept handlers that only throw, such as a stub that throws a defined `NOT_IMPLEMENTED` error, without a return type annotation.

## 0.4.0

### Minor Changes

- 011d62f: Body codecs receive headers instead of a content type: `serialize(value, headers)` gets the outgoing headers with the selected `content-type`, and `deserialize(body, headers)` the received ones, with lowercase names. Headers a codec returns with `serializedBody()` replace the handler's and the call's, `content-type` parameters included, so a codec can add a filename to `content-disposition`. Before, a handler's headers won over them. The client chooses a request's format from its `content-type` wherever it is set, the call's over `additionalHeaders` over `globalHeaders`. Before, a `content-type` in either was ignored and the body sent as JSON, although `globalHeaders` made the route's header optional. A Node request body can be read once, and a second read rejects as on Fetch instead of returning the same body or hanging.
- 0699974: Content types are `content-type` headers instead of their own concept, and a body is JSON unless that header says otherwise. A route accepts the request content types its headers schema declares and answers others with `415`, and the client states the content type in the call's headers. A defined response declares its content type in its headers schema, and an inferred one sends the header passed to `respond()`. `.body()` and `.response()` take a schema, and a stream response takes `sse(schema)`. Media type records, the `contentType` option of `respond()`, the `contentType` of handler arguments, client calls and results, and the `BodyContent`, `KnownBodyContentType`, `MediaType` and `ResponseContentDefinition` types are removed. A `FormData` body is always sent as `multipart/form-data`, and OpenAPI reads content types from the declared `content-type` header.
- 30f9ad3: Interceptors' `next()` rejects with every error thrown after it, `RouteError`s included, with the status, `data` and headers they're sent with, and `NOT_FOUND` for unmatched requests. Interceptors send errors by throwing. `errorResponse()` and `writeErrorResponse()` take any thrown value and are what the app sends with, so an interceptor catching with them turns errors into responses for the ones before it. `onError()` creates an interceptor that reports errors, response bodies that fail while they stream included. `createRouteHandlers` and `createCatchAllHandler` take `interceptors` too.
- 81f58db: Add interceptors: functions around everything an app or a client does for a request, for API key checks, logging, error reporting, metrics, retries or CORS. Pass them as `interceptors` to `createApp`, typed with `interceptor()` from `@rest-rpc/server`, or `@rest-rpc/server/node` for the Node `createApp`, and to `createClient`, typed with `clientInterceptor()`. They run first to last and see every response, error responses included.

- On the server, they receive every request, including ones that match no route, except those a route completed with `.static()` serves. `route` is the matched route's definition, with its path and `meta`, or `undefined` when no route matches. `next()` resolves with every response, `RouteError`s included, and rejects only with other thrown values, such as an `Error` a handler throws, which the app sends as `INTERNAL_SERVER_ERROR` when nothing catches it. A Node app also sends it when its interceptors finish without a response.
- A Fetch interceptor may call `next()` with another request for the matched route to read, or more than once, and receives the runtime's arguments after the request, such as Cloudflare's `env`, as `args`. A Node interceptor sets headers on the `ServerResponse` before calling `next()`.
- `errorResponse()` from `@rest-rpc/server` and `writeErrorResponse()` from `@rest-rpc/server/node` send the response of a `RouteError`, which clients decode as one, such as from a rate limit interceptor.
- On the client, they receive the Fetch `Request` and the called route, before the response is decoded.
- f86a7c5: A Fetch `Response` a handler returns is sent as it is, after middleware, without response validation or codecs, on Fetch and Node. Middleware receives it as the body of the envelope `next()` resolves to, with its status, headers and cookies, and the envelope's fields are sent. `.response(raw())` declares such a route, such as in a contract, and must be the route's only response. OpenAPI documents it as a default response. `.static(new Response(...))` sends a clone for every request, and `respond()` rejects a `Response` body.
- 8f0be69: Params, query and headers schemas accept any object input, and header values passed to `respond()`, `globalHeaders` and `additionalHeaders` accept any value, all sent with `String()` as documented. Before, their inputs had to be strings, numbers or booleans, so `z.coerce.number()` needed `<number>` to compile. A promise in `globalHeaders` is awaited, like the result of a provider function. `ClientHeaderValue` and `RequestScalar` are removed, and `ClientHeaders` is `Record<string, unknown>`.
- aa81df2: Remove the `onError` route option and the `notFound` option of both `createApp`s. Report errors from an interceptor instead, where `next()` rejects with them, and send a custom response for unmatched requests from an interceptor, which receives no `route` for them.
- 7e3354b: A `serializedBody()` without a `content-type` header is sent with the selected content type, on the client and the server. Before, the runtime chose one from the body, such as `text/plain;charset=UTF-8` for a string, which could contradict the route's content type. A `FormData` body is always sent with the `multipart/form-data` content type the runtime generates with its boundary, so the default multipart codec returns it as is instead of wrapping it in `serializedBody()`.
- eb281e2: Make server-sent events usable behind proxies and with other data formats. The client parses event streams following the SSE spec: LF, CRLF and CR line endings, an optional space after the colon, multi-line data, persisted ids and digit-only `retry` values. Stream responses are sent with `cache-control: no-cache` by default, so proxies don't cache or buffer them. `sseFormat()` and the `sse: { format }` option on the server and the client set the data format of events, JSON by default. The server's `sse` option also takes `keepAlive` and `initialComment`, which `respond(stream, { sse })` overrides per stream.

### Patch Changes

- 7e3354b: The Node adapter streams `Blob` response bodies, such as from `fs.openAsBlob()`, instead of reading each into memory, and sends their size as `content-length`. Static routes with a `Blob` body stream it for each response too.
- 7e3354b: The Node adapter streams `FormData` response bodies instead of reading each into memory, files included. They are sent without a `content-length`.
- 1b88943: Parsed query strings are objects without a prototype, so a `__proto__[]` key is an ordinary key instead of replacing the object's prototype, and fields the query doesn't contain read as `undefined` instead of inherited values such as an array's `length`.
- 350882a: `.static()` rejects a `respond()` result with a promise body, which is not awaited, like it rejects a promise value.

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
