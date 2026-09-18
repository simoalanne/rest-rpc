# @rest-rpc/core

## 0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- d72a045: Replace inferred and explicitly declared form array keys with bracket notation serialization across query parameters, URL-encoded forms, and multipart forms.
- 45d0fca: Replace the client response `declared` discriminator with status-based narrowing. Undeclared responses now preserve the untouched native `Response`, HTTP response declarations are limited to statuses from 100 through 599.
- 45d0fca: Replace conditional positional arguments on fetch client and tanstack query for request/options with simpler convention. To pass options when there is no request input pass undefined as first argument explictly
- 3cc08a5: Use `body(schema, { contentType })` and `input(schema, { contentType })` for every request body encoding, removing the form and multipart wrapper methods. An omitted body content type is normalized to `application/json`. Client calls select among multiple declared content types through the Fetch options argument. Server-first body calls always provide that option for non-JSON content types.
- 3cc08a5: Declare responses with `response(status, schema?, options?)`, where content type and typed headers are options and an omitted schema means no body. Store every response declaration as `{ body, contentType, headers? }`, normalizing an omitted body content type to `application/json` and `streamResponse()` to `application/x-ndjson`; no-body responses use `body: undefined`. Remove the custom body wrapper types, `isStandardSchema()`, and `customStreamResponse()`. Fetch clients parse and validate non-stream custom responses, with an optional `bodyParser` client setting for custom decoding.
- 45d0fca: Replace `.fetch` and `.fetchResponse` with callable route leaves that return the response envelope. Server-first HTTP selectors now accept the path, grouped request, and Fetch API options in one call.
- d72a045: Add custom codecs support for fetch client and server adapters
- 3cc08a5: Remove `jsonQuery(schema)` support. This allowed to sent json via query string, but added unnecessary complexity to the client and server.
- d72a045: Remove flattened request keys convention and make each http declaration specify the request segments
- d72a045: Remove support of returning undeclared headers through server handler. Remove set-cookie header helpers
- d72a045: Remove the WebSocket and server-sent events abstractions, including their route builders, client and server helpers, adapter options, and related public types.
- 45d0fca: Add server-first route declarations and implementations, typed clients derived from server implementations, and matching TanStack Query helpers. Add new `@rest-rpc/node` adapter for serving routes directly with Node HTTP `IncomingMessage` and `ServerResponse` handler.
- 45d0fca: Add shorthand routes that omit explicit HTTP details and behave like procedures. Support shorthand declarations in server-first implementations, generated clients, OpenAPI documents, and TanStack Query helpers. Procedure handlers receive validated input under an `input` field while clients pass the input value directly.
- b301886: Remove the `strictStatusCodes` route factory option and make its behavior the default. HTTP clients now return only contract-declared responses and throw when a server returns an undeclared status. TanStack Query errors no longer include an undeclared `rawResponse` branch.

### Patch Changes

- eb811fd: Add HttpError to core package and convert all unknown responses to one

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

- cd60c4c: Update several helper types to render in prettier way when hovering over them in IDEs. This is a purely cosmetic change and does not affect the actual types.

## 0.1.0-beta.18

### Minor Changes

- ebae920: Align multipartBody() API with formBody() API.

### Patch Changes

- 1494193: flattenRequestKeys can now be overridden by parent router instead of silently defaulting to true when stacking route/router declarations

## 0.1.0-beta.17

### Patch Changes

- b763439: fix a bug with tanstack query cache keys being empty when stacking route/router calls

## 0.1.0-beta.16

### Patch Changes

- d92c809: Make schemaConverter optional and add transform hooks for generated OpenAPI parameters and operations
- 7d783af: Rename API surfaces. Add support for strictStatusCodes for tanstack-query helpers

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
- 62ff0d2: Add a helper type StrictClientResponse<T> for inferring responses from api client configured with strict status codes

## 0.1.0-beta.14

### Patch Changes

- a787af6: Add field raw to access the raw websocket instance in client WebSocket wrapper and stop mutating that instance
- 751b957: add support for resolving request keys from valibot variant schema
- b228897: add option to use strict responses, rename unknownRequestKeys option to strictRequestKeys for consistency, add type-level support that makes getGlobalHeaders returned header keys optional for each fetch call

## 0.1.0-beta.13

### Patch Changes

- d643f76: improve generated API reference by changing exported arrow functions to regular functions and dropping unnecssary noisy exports
- c6f7dcc: Add tsdoc comments for every package root export

## 0.1.0-beta.12

## 0.1.0-beta.11

### Minor Changes

- 8851cf2: improved names for type helpers
- 4f8d7db: export changes

### Patch Changes

- 5676c02: improve npm package metadata with descriptions, keywords, and repository directories.

## 0.1.0-beta.10

## 0.1.0-beta.9

### Minor Changes

- d170b41: rename origin -> baseUrl and allow baseUrl to be any value

### Patch Changes

- 5676c02: update packages README.md file

## 0.1.0-beta.8

## 0.1.0-beta.7

### Minor Changes

- 997c886: Add end-to-end HTTP cancellation for built-in NDJSON streams and handler `AbortSignal`s, and scope `timeoutMs` to waiting for `fetch` to return a `Response`.

## 0.1.0-beta.6

### Minor Changes

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
- 00a5d04: automatically infer path params schema from path string if not provided by user

### Patch Changes

- 2ca9817: remove undocumented 'validate' option + undocumented regex export

## 0.1.0-beta.2

### Minor Changes

- 0d7133f: Allow request fields directly on route declarations, support {id} path params, redesign cache keys for Next/TanStack Query, and reduce expensive contract types for better typechecking performance.

## 0.1.0-beta.1

### Minor Changes

- 23017bc: Support async Standard Schema validation across async runtime boundaries and remove async contract definition helpers.

## 0.1.0-beta.0

### Minor Changes

- d72a045: Initial release of rest-rpc
