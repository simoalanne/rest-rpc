# @rest-rpc/node

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
- 45d0fca: Use each framework's native error-handling flow for request and response validation failures. Replace the shared server error-handler API with exported validation error classes and adapter-specific hooks allowing for more native feeling error handling.
- d72a045: Remove flattened request keys convention and make each http declaration specify the request segments
- d72a045: Remove support of returning undeclared headers through server handler. Remove set-cookie header helpers
- d72a045: Remove the WebSocket and server-sent events abstractions, including their route builders, client and server helpers, adapter options, and related public types.
- 45d0fca: Add server-first route declarations and implementations, typed clients derived from server implementations, and matching TanStack Query helpers. Add new `@rest-rpc/node` adapter for serving routes directly with Node HTTP `IncomingMessage` and `ServerResponse` handler.
