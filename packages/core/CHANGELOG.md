# @rest-rpc/core

## 0.1.0-beta.3

### Minor Changes

- 5e6ddbd: Add shorthands where a single response may be provided with status code inferred from method or no response/responses may be provided and inferred as method status + noBody
- 00a5d04: automatically infer path params schema from path string if not provided by user

### Patch Changes

- 2ca9817: remove undocumented 'validate' option + undocumented regex export
- 2ca9817: remove undocumented '

## 0.1.0-beta.2

### Minor Changes

- 0d7133f: Allow request fields directly on route declarations, support {id} path params, redesign cache keys for Next/TanStack Query, and reduce expensive contract types for better typechecking performance.

## 0.1.0-beta.1

### Minor Changes

- 23017bc: Support async Standard Schema validation across async runtime boundaries and remove async contract definition helpers.

## 0.1.0-beta.0

### Minor Changes

- d72a045: Initial release of rest-rpc
