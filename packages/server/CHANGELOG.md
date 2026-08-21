# @rest-rpc/server

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
