# @rest-rpc/server

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
