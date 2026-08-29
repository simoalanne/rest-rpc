# @rest-rpc/fastify

## 0.1.0-beta.17

## 0.1.0-beta.16

### Patch Changes

- 52d0d20: rename server registerRoutes to splitRouteImplementations to decribe its role more accurately.
  Allow onRequestValidationError hook to return undefined to match the consistency of the other hooks.

## 0.1.0-beta.15

### Patch Changes

- 5676c02: Rename the Fetch runtime adapter package from `@rest-rpc/web` to `@rest-rpc/fetch` and rename public Web-prefixed adapter types to Fetch-prefixed names. Rename Server webResponse

## 0.1.0-beta.14

### Patch Changes

- 5676c02: Add support for implementing handlers for router as a class

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

### Minor Changes

- 9a3f3b9: add support for route-aware middleware/preHandler for express,hono,fastify

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
