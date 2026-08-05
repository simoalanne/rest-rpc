# contract-first-api overview

Use this reference when the task spans multiple packages or when you need the
library's overall mental model.

## Purpose

`contract-first-api` is a TypeScript toolkit for defining an API contract once
and reusing them across:

- runtime validation
- typed Express handlers
- typed runtime clients
- optional React Query adapters
- OpenAPI document generation

The library is designed to keep normal HTTP semantics while avoiding duplicate
request and response typing across backend and frontend.

It has fewer features than larger contract-first or RPC frameworks, but is more lightweight and less opinionated. It is intended for teams that want to keep their own HTTP stack and only need one shared API contract with runtime validation and type inference.


## Compared to Other Libraries
 - `https://ts-rest.com/` is most similar and this library's inspiration. It's however heavier and is currently not actively developed.
 - `https://orpc.dev/` is a ts-rest competitor but leans more heavily towards RPC than RESTful HTTP semantics. It also has a more complex setup and is less lightweight.

## Core Model

One shared API contract is the source of truth.

The API contract is a plain TypeScript object with route declarations and
Standard Schema-compatible schemas. Integration packages consume that object
instead of generating a second representation.

Typical package roles:

- `@contract-first-api/core`
  Defines the API contract, shared types, response helpers, and the typed client.
- `@contract-first-api/express`
  Mounts the API contract on an Express app with validation and typed services.
- `@contract-first-api/react-query`
  Creates React Query hooks and cache helpers from the API contract.
- `@contract-first-api/openapi`
  Generates a plain OpenAPI document object from JSON routes.

Runtime validation works with synchronous Standard Schema-compatible schemas.
Request key inference is built in for common object schemas from Zod, Valibot,
and ArkType. Other Standard Schema libraries can be used by providing
`request.requestKeys` or `resolveRequestKeys(schema)`.

## Route Shapes

Each route is one of the main shapes below:

- HTTP
  Default request and response route with status-keyed `responses`. JSON object
  request bodies are flattened into client and service inputs.
- custom body
  Use `customBody({ schema, contentType })` in `request.body` when the request
  body should be treated as one whole `body` value instead of flattened fields.
- no body
  Omit `request.body` as shorthand for no request body, or use `body: noBody()`
  to declare it explicitly. Use `noBody()` for responses without a body.
- streaming
  NDJSON streaming response body declared with `streamBody(schema)`.
- `websocket`
  Bidirectional message schemas instead of a normal response body.

These shapes affect how every integration package behaves.

## Practical Rules

- Keep one shared API contract in a shared package or shared module.
- Let integrations derive behavior from the API contract instead of
  duplicating DTOs.
- When debugging, check both the package README and the package source/tests if
  behavior is unclear.
