---
"@rest-rpc/core": minor
"@rest-rpc/server": minor
"@rest-rpc/tanstack-query": minor
---

Replace type-driven contract generation with runtime extraction. `generateContractFromType` and the `@rest-rpc/core/generate` entry point are removed, along with the optional `typescript` peer dependency. Call `extractContract(routes)` from `@rest-rpc/core` at build time instead: it keeps each route's method, resolved path, and request content type, and its type is the route tree type. An extracted contract has no schemas, so the client does not validate responses against them.

Remove `.input()`, `.output()`, and `.streamOutput()` from the route builder, along with the `OutputOptions` and `StreamOutputOptions` types. Declare request segments with `.body()` or `.query()`, and responses with `.response(schema, options)`, whose `status` option defaults to 200. Migrate `.output(schema)` → `.response(schema)`, `.response(201, schema)` → `.response(schema, { status: 201 })`, `.response(204)` → `.response({ status: 204 })`, and `.streamResponse(200, schema)` → `.streamResponse(schema)`. `BodylessResponseOptions` is exported for bodyless responses.

A handler result that is an object with a numeric `status` is a response envelope, and any other value is the body of a 200 response. This applies to inferred and declared routes, and a handler can return both forms. Custom-content plain results return `{ status: 200, body, contentType }` instead of `{ contentType, data }`.

Every client call takes `{ params, query, body, headers }` and returns a `status`-discriminated envelope. Client results no longer have `rawHeaders`: `headers` is a record of every response header, with declared or inferred headers typed, and validated header output is merged over the received headers. Every `text/event-stream` response is parsed as an SSE stream before body codecs. TanStack Query `data` is the 2xx envelope, so use `select` to read only the `body`.
