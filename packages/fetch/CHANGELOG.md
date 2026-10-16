# @rest-rpc/fetch

## 0.1.0-beta.25

## 0.1.0-beta.24

### Minor Changes

- fec6317: Rename the adapter `RouteHandler` type to `InferServerHandler` to match the `Infer*` style of the core helpers. `InferServerHandler` now expects a plain return value for `.output()` routes instead of a status envelope. Remove `RouteRequest` and `RouteErrors` from the adapter roots: use `InferServerRequest` for the validated request, `Parameters<InferServerHandler<typeof route>>[0]` for the full handler argument, and `Extract<InferServerResponse<typeof route>, { status: 404 }>` for specific status responses.
- fec6317: Move adapter building blocks out of the package roots. `createFetchResponse` and `deserializeRequestBody` are now exported from `@rest-rpc/fetch/adapter` (replacing the `@rest-rpc/fetch/deserializeRequestBody` subpath), and `createRequestSignal`, `parseRequestTarget`, `createNodeResponseStream`, `writeNodeResponse`, `writeStreamResponse`, and `nodeBodyCodecs` from `@rest-rpc/node/adapter`. Both roots now export `InferServerHandler` like the other adapters, no longer export the `ImplicitResponse*`/`ServerFirst*` types, and `@rest-rpc/fetch` exports `FetchRouteHandlerResult`.
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

### Patch Changes

- 5676c02: re-export type<T>() helper from all server adapters

## 0.1.0-beta.20

### Minor Changes

- d72a045: Replace inferred and explicitly declared form array keys with bracket notation serialization across query parameters, URL-encoded forms, and multipart forms.
- d72a045: Add custom codecs support for fetch client and server adapters
- f1e7102: Replace automatic 404 handling for non-matched route with a result type, giving more control for user on how to handle non-matched routes
- 45d0fca: Use each framework's native error-handling flow for request and response validation failures. Replace the shared server error-handler API with exported validation error classes and adapter-specific hooks allowing for more native feeling error handling.
- d72a045: Remove flattened request keys convention and make each http declaration specify the request segments
- d72a045: Remove support of returning undeclared headers through server handler. Remove set-cookie header helpers
- d72a045: Remove the WebSocket and server-sent events abstractions, including their route builders, client and server helpers, adapter options, and related public types.
- 45d0fca: Add server-first route declarations and implementations, typed clients derived from server implementations, and matching TanStack Query helpers. Add new `@rest-rpc/node` adapter for serving routes directly with Node HTTP `IncomingMessage` and `ServerResponse` handler.

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

## 0.1.0-beta.18

## 0.1.0-beta.17

## 0.1.0-beta.16

## 0.1.0-beta.15

### Patch Changes

- 90a28df: Restrict unknown key access for typescript for context types
- 15d9aca: Remove initWeb<T>() api and replace it with documented module augmentation
- ea61381: Add formBody() for typed application/x-www-form-urlencoded request bodies
- ea61381: Add multipartBody() that provides type safe usage of multipart/form-data

## 0.1.0-beta.14

### Patch Changes

- 5676c02: Add support for implementing handlers for router as a class
- 8611b28: Add support for nesting route/route declarations inside another router and allow stacking .middleware() calls

## 0.1.0-beta.13

### Patch Changes

- d643f76: improve generated API reference by changing exported arrow functions to regular functions and dropping unnecssary noisy exports
- c6f7dcc: Add tsdoc comments for every package root export

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

- 48b395f: Add support for single middleware-like option for web/next package
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

## 0.1.0-beta.5

## 0.1.0-beta.4

## 0.1.0-beta.3

## 0.1.0-beta.2

## 0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- d72a045: Initial release of rest-rpc
