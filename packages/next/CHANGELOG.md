# @rest-rpc/next

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

- 5676c02: Rename the Fetch runtime adapter package from `@rest-rpc/web` to `@rest-rpc/fetch` and rename public Web-prefixed adapter types to Fetch-prefixed names. Rename Server webResponse

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

### Patch Changes

- 348f93c: fix NextRouteHandlerContext type to include signal

## 0.1.0-beta.7

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
