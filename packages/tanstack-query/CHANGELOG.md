# @rest-rpc/tanstack-query

## 0.1.0-beta.21

## 0.1.0-beta.20

### Minor Changes

- d72a045: Replace inferred and explicitly declared form array keys with bracket notation serialization across query parameters, URL-encoded forms, and multipart forms.
- 45d0fca: Replace the client response `declared` discriminator with status-based narrowing. Undeclared responses now preserve the untouched native `Response`, HTTP response declarations are limited to statuses from 100 through 599.
- 45d0fca: Replace conditional positional arguments on fetch client and tanstack query for request/options with simpler convention. To pass options when there is no request input pass undefined as first argument explictly
- 45d0fca: Replace `.fetch` and `.fetchResponse` with callable route leaves that return the response envelope. Server-first HTTP selectors now accept the path, grouped request, and Fetch API options in one call.
- d72a045: Add custom codecs support for fetch client and server adapters
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

## 0.1.0-beta.17

### Patch Changes

- c1b8f7c: Add streamedQueryOptions and remove sse routes from being suggested for tanstack query as valid
- b763439: fix a bug with tanstack query cache keys being empty when stacking route/router calls

## 0.1.0-beta.16

### Patch Changes

- 7d783af: Rename API surfaces. Add support for strictStatusCodes for tanstack-query helpers

## 0.1.0-beta.15

### Patch Changes

- 5676c02: Rename the Fetch runtime adapter package from `@rest-rpc/web` to `@rest-rpc/fetch` and rename public Web-prefixed adapter types to Fetch-prefixed names. Rename Server webResponse

## 0.1.0-beta.14

## 0.1.0-beta.13

### Minor Changes

- a226f2d: rename tanstack infiniteQueryOptions args to be more describing

### Patch Changes

- d643f76: improve generated API reference by changing exported arrow functions to regular functions and dropping unnecssary noisy exports
- c6f7dcc: Add tsdoc comments for every package root export

## 0.1.0-beta.12

## 0.1.0-beta.11

### Minor Changes

- 4f8d7db: export changes

### Patch Changes

- 5676c02: improve npm package metadata with descriptions, keywords, and repository directories.
- 8851cf2: improved names for type helpers

## 0.1.0-beta.10

## 0.1.0-beta.9

### Minor Changes

- d170b41: rename origin -> baseUrl and allow baseUrl to be any value

### Patch Changes

- 5676c02: update packages README.md file

## 0.1.0-beta.8

## 0.1.0-beta.7

## 0.1.0-beta.6

## 0.1.0-beta.5

## 0.1.0-beta.4

## 0.1.0-beta.3

## 0.1.0-beta.2

## 0.1.0-beta.1

## 0.1.0-beta.0

### Minor Changes

- d72a045: Initial release of rest-rpc
