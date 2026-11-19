# @rest-rpc/core

## 0.6.0

No changes in this release.

## 0.5.0

### Minor Changes

- 3d6507c: Export the built-in body codecs from `@rest-rpc/core` and `@rest-rpc/server` as `jsonCodec`, `urlEncodedCodec`, `formDataCodec`, `textCodec` and `binaryCodec`, so a custom codec can call one for the values it doesn't handle. Their operations are both defined and typed with what they return, such as `Promise<FormData>` from `formDataCodec.deserialize()`.

`IncomingBody` has a `formData()` method, which the Node server implements too, so a codec reads a multipart body with `await body.formData()` on every runtime. An object implementing `IncomingBody` must add it.

### Patch Changes

- 34a29eb: Show a client call's resolved response, such as `{ status: 200; body: Post; ... }`, on hover in editors instead of an internal `ClientResponseEntry` type.

## 0.4.0

### Minor Changes

- 7e3354b: `BodyValue` types the chunks of streams a serializer returns, as `ReadableStream<Uint8Array>` or `AsyncIterable<string | Uint8Array>`. Other chunks already failed when the response was sent, after its headers, and are now a type error in custom codecs.
- 30ef141: An error response without a string `code`, such as a proxy's error page, rejects with an `Error` whose `cause` holds the response as the client received it: its status, headers, cookies and decoded body. Before, only the status was kept, in the message.
- 81f58db: Replace the client's `baseUrl` option with `origin` and `mountPath`, which are both optional. A browser app served from the same origin as its routes needs no options, and `mountPath` is the same as the server's. Outside browsers, a call without `origin` rejects with a `TypeError`. A trailing slash of `origin` is ignored, and an `origin` with a path throws a `TypeError` when the client is created. Migrate `baseUrl: "https://api.example.com/api"` to `origin: "https://api.example.com", mountPath: "/api"`.

The client's `fetch` option always receives a Fetch `Request`, so its type is `(request: Request) => Promise<Response>`. Before, it received a URL and `RequestInit`. A Fetch app's `fetch` can now serve a client in the same process, such as `fetch: app.fetch` in tests.

- 011d62f: Body codecs receive headers instead of a content type: `serialize(value, headers)` gets the outgoing headers with the selected `content-type`, and `deserialize(body, headers)` the received ones, with lowercase names. Headers a codec returns with `serializedBody()` replace the handler's and the call's, `content-type` parameters included, so a codec can add a filename to `content-disposition`. Before, a handler's headers won over them. The client chooses a request's format from its `content-type` wherever it is set, the call's over `additionalHeaders` over `globalHeaders`. Before, a `content-type` in either was ignored and the body sent as JSON, although `globalHeaders` made the route's header optional. A Node request body can be read once, and a second read rejects as on Fetch instead of returning the same body or hanging.
- 0699974: Content types are `content-type` headers instead of their own concept, and a body is JSON unless that header says otherwise. A route accepts the request content types its headers schema declares and answers others with `415`, and the client states the content type in the call's headers. A defined response declares its content type in its headers schema, and an inferred one sends the header passed to `respond()`. `.body()` and `.response()` take a schema, and a stream response takes `sse(schema)`. Media type records, the `contentType` option of `respond()`, the `contentType` of handler arguments, client calls and results, and the `BodyContent`, `KnownBodyContentType`, `MediaType` and `ResponseContentDefinition` types are removed. A `FormData` body is always sent as `multipart/form-data`, and OpenAPI reads content types from the declared `content-type` header.
- 81f58db: Add interceptors: functions around everything an app or a client does for a request, for API key checks, logging, error reporting, metrics, retries or CORS. Pass them as `interceptors` to `createApp`, typed with `interceptor()` from `@rest-rpc/server`, or `@rest-rpc/server/node` for the Node `createApp`, and to `createClient`, typed with `clientInterceptor()`. They run first to last and see every response, error responses included.

- On the server, they receive every request, including ones that match no route, except those a route completed with `.static()` serves. `route` is the matched route's definition, with its path and `meta`, or `undefined` when no route matches. `next()` resolves with every response, `RouteError`s included, and rejects only with other thrown values, such as an `Error` a handler throws, which the app sends as `INTERNAL_SERVER_ERROR` when nothing catches it. A Node app also sends it when its interceptors finish without a response.
- A Fetch interceptor may call `next()` with another request for the matched route to read, or more than once, and receives the runtime's arguments after the request, such as Cloudflare's `env`, as `args`. A Node interceptor sets headers on the `ServerResponse` before calling `next()`.
- `errorResponse()` from `@rest-rpc/server` and `writeErrorResponse()` from `@rest-rpc/server/node` send the response of a `RouteError`, which clients decode as one, such as from a rate limit interceptor.
- On the client, they receive the Fetch `Request` and the called route, before the response is decoded.
- f86a7c5: A Fetch `Response` a handler returns is sent as it is, after middleware, without response validation or codecs, on Fetch and Node. Middleware receives it as the body of the envelope `next()` resolves to, with its status, headers and cookies, and the envelope's fields are sent. `.response(raw())` declares such a route, such as in a contract, and must be the route's only response. OpenAPI documents it as a default response. `.static(new Response(...))` sends a clone for every request, and `respond()` rejects a `Response` body.
- 8f0be69: Params, query and headers schemas accept any object input, and header values passed to `respond()`, `globalHeaders` and `additionalHeaders` accept any value, all sent with `String()` as documented. Before, their inputs had to be strings, numbers or booleans, so `z.coerce.number()` needed `<number>` to compile. A promise in `globalHeaders` is awaited, like the result of a provider function. `ClientHeaderValue` and `RequestScalar` are removed, and `ClientHeaders` is `Record<string, unknown>`.
- 7e3354b: A `serializedBody()` without a `content-type` header is sent with the selected content type, on the client and the server. Before, the runtime chose one from the body, such as `text/plain;charset=UTF-8` for a string, which could contradict the route's content type. A `FormData` body is always sent with the `multipart/form-data` content type the runtime generates with its boundary, so the default multipart codec returns it as is instead of wrapping it in `serializedBody()`.
- eb281e2: Make server-sent events usable behind proxies and with other data formats. The client parses event streams following the SSE spec: LF, CRLF and CR line endings, an optional space after the colon, multi-line data, persisted ids and digit-only `retry` values. Stream responses are sent with `cache-control: no-cache` by default, so proxies don't cache or buffer them. `sseFormat()` and the `sse: { format }` option on the server and the client set the data format of events, JSON by default. The server's `sse` option also takes `keepAlive` and `initialComment`, which `respond(stream, { sse })` overrides per stream.

### Patch Changes

- c56f8b6: OpenAPI documents array query parameters as `name[]` with `style: form` and `explode: true`, the way the client sends them and the server reads them.
- 1b88943: OpenAPI documents a defined request body as required. Before, `requestBody.required` was never set, so generated SDKs made every body optional.
- 1b88943: A `.response()` for a status the route already defines is a type error. So is a `.response()` status outside 200 to 299. Before, both only threw when the route was defined.

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
