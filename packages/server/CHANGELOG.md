# @rest-rpc/server

## 0.1.0-beta.25

### Minor Changes

- daefcb5: Add `serializeHttpRouteResult`, which serializes a route result body with the matching body codec and merges codec and result headers, and `createAdapterApi` with its `AdapterApi` type, which types `route` and `implement` for an adapter's handler fields. All adapters use them. Node, Express, Fastify and Nest now throw "No serializer for declared content-type" when no codec matches a response body, as Fetch and Hono already did.
- daefcb5: Export `isImplementedRoute` and the `ImplementedRoute` type, which detect a route leaf with an attached handler in an implementation tree.
- daefcb5: `.openAPI()` no longer accepts `responses`. Describe a response with the `description` option of `.response()`, `.output()`, `.streamResponse()` or `.streamOutput()` instead, for example `.response(204, undefined, { description: "Todo deleted." })`. OpenAPI-only response headers are removed: document typed headers with the response `headers` option, or add other headers with `transformOperation`. `.streamResponse()` now accepts `headers`, so declared stream responses can type and validate their headers like other responses. `OutputOptions`, `StreamResponseOptions` and `StreamOutputOptions` are exported.

Response headers now use one name. Handlers return them as `headers` instead of `responseHeaders`, for example `{ status: 201, body, headers: { location } }`. Client results expose the typed declared headers as `headers` instead of `responseHeaders`, and the Fetch `Headers` object moves from `headers` to `rawHeaders`.

- 5a6a1ce: Replace type-driven contract generation with runtime extraction. `generateContractFromType` and the `@rest-rpc/core/generate` entry point are removed, along with the optional `typescript` peer dependency. Call `extractContract(routes)` from `@rest-rpc/core` at build time instead: it keeps each route's method, resolved path, and request content type, and its type is the route tree type. An extracted contract has no response declarations, so the client returns any status as an envelope without checking it against the route types.

Remove `.input()`, `.output()`, and `.streamOutput()` from the route builder, along with the `OutputOptions` and `StreamOutputOptions` types. Declare request segments with `.body()` or `.query()`, and responses with `.response(schema, options)`, whose `status` option defaults to 200. Migrate `.output(schema)` → `.response(schema)`, `.response(404, schema)` → `.response(schema, { status: 404 })`, `.response(204)` → `.response({ status: 204 })`, and `.streamResponse(200, schema)` → `.streamResponse(schema)`. `BodylessResponseOptions` is exported for bodyless responses.

A handler result that is an object with a numeric `status` is a response envelope, and any other value is the body of a 200 response. This applies to inferred and declared routes, and a handler can return both forms. Custom-content plain results return `{ status: 200, body, contentType }` instead of `{ contentType, data }`.

Every client call takes `{ params, query, body, headers }` and returns a `status`-discriminated envelope. Client results no longer have `rawHeaders`: `headers` is a record of every response header, with declared or inferred headers typed, and validated header output is merged over the received headers. Every `text/event-stream` response is parsed as an SSE stream before body codecs. TanStack Query `data` is the 2xx envelope, so use `select` to read only the `body`.

- daefcb5: Rename `serverFirstRoute` to `serverRoute` and the `ServerRouteBuilder` type to `PublicServerRouteBuilder`. Remove the unused `ServerFirstResponseKind` and `ServerFirstRouteResponseKind` types. The server route builder is now a subclass of the core route builder instead of methods patched onto its prototype.

### Patch Changes

- daefcb5: `createRouteMatcher` and `flattenRouteImplementations` throw a clear error when an implementation tree contains a route without a handler.

## 0.1.0-beta.24

### Minor Changes

- fec6317: Rename the adapter `RouteHandler` type to `InferServerHandler` to match the `Infer*` style of the core helpers. `InferServerHandler` now expects a plain return value for `.output()` routes instead of a status envelope. Remove `RouteRequest` and `RouteErrors` from the adapter roots: use `InferServerRequest` for the validated request, `Parameters<InferServerHandler<typeof route>>[0]` for the full handler argument, and `Extract<InferServerResponse<typeof route>, { status: 404 }>` for specific status responses.
- fec6317: Type helpers accept a route tree as well as a single route and infer a matching tree of types, so one exported type can be indexed per route: `InferServerRequest<typeof routes>["todos"]["create"]`. This applies to `InferClientRequest`, `InferClientResponse`, `InferServerRequest`, `InferServerResponse`, the adapter `InferServerHandler`, and the TanStack Query `Infer*` helpers. Add `InferClientStreamData` to `@rest-rpc/core`, which infers the `data` of each event received from a streaming route without the `SseEvent` wrapper.

## 0.1.0-beta.23

### Minor Changes

- d72a045: Replace direct application context property access with a typed per-request `context.get(key)` and `context.set(key, value)` store.
- d72a045: Add .$context<T>() for ther route builder to specify context for specific set of routes. Remove providing initial context option from route registeration.

### Patch Changes

- 8db54c8: Allow path to be omitted from http methods in route builder. enforce leading slash in paths in types.
- 5676c02: Allow reusable context type and middleware for implement api
- 5676c02: add options to disable request and response validation across server adapters

## 0.1.0-beta.22

### Minor Changes

- d72a045: more flexible route builder
- d72a045: centralize type helpers

## 0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- d72a045: Replace inferred and explicitly declared form array keys with bracket notation serialization across query parameters, URL-encoded forms, and multipart forms.
- 3cc08a5: Use `body(schema, { contentType })` and `input(schema, { contentType })` for every request body encoding, removing the form and multipart wrapper methods. An omitted body content type is normalized to `application/json`. Client calls select among multiple declared content types through the Fetch options argument. Server-first body calls always provide that option for non-JSON content types.
- 3cc08a5: Declare responses with `response(status, schema?, options?)`, where content type and typed headers are options and an omitted schema means no body. Store every response declaration as `{ body, contentType, headers? }`, normalizing an omitted body content type to `application/json` and `streamResponse()` to `application/x-ndjson`; no-body responses use `body: undefined`. Remove the custom body wrapper types, `isStandardSchema()`, and `customStreamResponse()`. Fetch clients parse and validate non-stream custom responses, with an optional `bodyParser` client setting for custom decoding.
- d72a045: Add custom codecs support for fetch client and server adapters
- 3cc08a5: Remove `jsonQuery(schema)` support. This allowed to sent json via query string, but added unnecessary complexity to the client and server.
- f1e7102: Replace automatic 404 handling for non-matched route with a result type, giving more control for user on how to handle non-matched routes
- 45d0fca: Use each framework's native error-handling flow for request and response validation failures. Replace the shared server error-handler API with exported validation error classes and adapter-specific hooks allowing for more native feeling error handling.
- d72a045: Remove flattened request keys convention and make each http declaration specify the request segments
- d72a045: Remove support of returning undeclared headers through server handler. Remove set-cookie header helpers
- d72a045: Remove the WebSocket and server-sent events abstractions, including their route builders, client and server helpers, adapter options, and related public types.
- 45d0fca: Add server-first route declarations and implementations, typed clients derived from server implementations, and matching TanStack Query helpers. Add new `@rest-rpc/node` adapter for serving routes directly with Node HTTP `IncomingMessage` and `ServerResponse` handler.
- 45d0fca: Add shorthand routes that omit explicit HTTP details and behave like procedures. Support shorthand declarations in server-first implementations, generated clients, OpenAPI documents, and TanStack Query helpers. Procedure handlers receive validated input under an `input` field while clients pass the input value directly.

## 0.1.0-beta.19

### Minor Changes

- 1ea1c91: Redesign contract declaration around fluent, per-route builders. This is a
  breaking beta change that replaces object-shaped route declarations with plain
  contract trees composed from `route.get()`, `route.post()`, `route.sse()`, and
  `route.ws()` builders.

Request locations are now declared through builder methods such as `.params()`,
`.query()`, `.headers()`, and `.body()`. These methods accept whole-location
schemas, allowing schema input and output generics to document client transport
values and validated handler values directly. `pathParams` has also been renamed
to `params` across contracts, grouped client inputs, handlers, and server adapter
boundaries.

Response statuses are now explicit. Use repeated `.response(status, schema)`
calls for ordinary responses and `.response(status)` for responses without a
body. Dedicated builder methods cover form, multipart, custom-content, streamed,
SSE, and WebSocket requests and responses. Shared route configuration now uses
`route.with()`, while route-specific OpenAPI metadata uses `.withOpenApi()`.

WebSocket declarations now consistently produce `{ type, message }` envelopes
through `.clientMessage()` and `.serverMessage()` instead of supporting multiple
competing message representations.

The redesign makes route declarations discoverable through autocomplete,
standardizes previously overlapping representations, and reduces the runtime
and type-level complexity required to normalize contracts. Clients, servers,
adapters, OpenAPI generation, TanStack Query helpers, tests, benchmarks, and
documentation have been updated to consume the new route representation.

### Patch Changes

- f10e616: Allow RouteResponseError to be scoped to any part of the contract not just specific route so it's easier to use in shared code with common responses. Additionally fix an issue where RouteResponseError declared errors thrown by the route handler would not go through response validation correctly. Also fix an issue where shorthand response with status field was allowed and could lead to unpredictable behaviour

## 0.1.0-beta.18

### Minor Changes

- ebae920: Align multipartBody() API with formBody() API.

## 0.1.0-beta.17

## 0.1.0-beta.16

### Patch Changes

- 52d0d20: rename server registerRoutes to splitRouteImplementations to decribe its role more accurately.
  Allow onRequestValidationError hook to return undefined to match the consistency of the other hooks.

## 0.1.0-beta.15

### Minor Changes

- 0ea9523: Add support for using explicit http shape for http requests as alternative

### Patch Changes

- 5676c02: Rename the Fetch runtime adapter package from `@rest-rpc/web` to `@rest-rpc/fetch` and rename public Web-prefixed adapter types to Fetch-prefixed names. Rename Server webResponse
- 8ed8d40: Remove exports from server and core packages that were not any of use
- 32758ad: Add an option to omit content type for custom body and let fetch infer it
- ea61381: Add formBody() for typed application/x-www-form-urlencoded request bodies
- f162fff: Add array field support to formBody()
- ea61381: Add multipartBody() that provides type safe usage of multipart/form-data

## 0.1.0-beta.14

### Patch Changes

- 5676c02: Add support for implementing handlers for router as a class
- 8611b28: Add support for nesting route/route declarations inside another router and allow stacking .middleware() calls
- 7d54706: optimize path matching performance

## 0.1.0-beta.13

### Patch Changes

- d643f76: improve generated API reference by changing exported arrow functions to regular functions and dropping unnecssary noisy exports
- c6f7dcc: Add tsdoc comments for every package root export
- b82b338: rename RawWebSocket type to WebSocketLike

## 0.1.0-beta.12

### Minor Changes

- 0f23a31: Harden server error handling for parser, response validation, and WebSocket upgrade failures

## 0.1.0-beta.11

### Minor Changes

- 4f8d7db: export changes

### Patch Changes

- 5676c02: improve npm package metadata with descriptions, keywords, and repository directories.

## 0.1.0-beta.10

### Minor Changes

- bf4ad62: Remove routes function and replace it conseptually by allowing to stack router/route calls excluding web/next which cannot do that due to having different implementation

## 0.1.0-beta.9

### Patch Changes

- 5676c02: update packages README.md file

## 0.1.0-beta.8

## 0.1.0-beta.7

### Minor Changes

- 997c886: Add end-to-end HTTP cancellation for built-in NDJSON streams and handler `AbortSignal`s, and scope `timeoutMs` to waiting for `fetch` to return a `Response`.

## 0.1.0-beta.6

### Minor Changes

- c6dbcc9: convenience setCookie and clearCookie helpers for server adapters
- fc89f34: add support for route status code specific response headers so important headers can be declared and must be returned from server handlers

## 0.1.0-beta.5

### Minor Changes

- 83d3fb8: add support for declaring multiple content types for a route

## 0.1.0-beta.4

### Minor Changes

- fefc87e: add natural support for multiple websocket messages instead of only relying on schema libraries discriminated union types
- ebae920: Add jsonQuery support for complex query input.

## 0.1.0-beta.3

### Minor Changes

- 5e6ddbd: Add shorthands where a single response may be provided with status code inferred from method or no response/responses may be provided and inferred as method status + noBody

## 0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 23017bc: Support async Standard Schema validation across async runtime boundaries and remove async contract definition helpers.

## 0.1.0-beta.0

### Minor Changes

- d72a045: Initial release of rest-rpc
