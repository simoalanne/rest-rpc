# @rest-rpc/core

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
