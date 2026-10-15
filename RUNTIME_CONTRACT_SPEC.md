# Runtime Contract Extraction (temporary spec)

Replaces type-driven client contract generation (`generateContractFromType`,
TypeScript compiler API) with runtime extraction from the server route tree.
The library is HTTP first: there is no separate RPC input/output path.

## Route builder

- Removed: `.input()`, `.output()`, `.streamOutput()`, flat input and the
  plain-output route mode (`output: "output" | "response"`).
- Remaining defaults (the only shortcuts):
  - method defaults to POST when no method setter is called,
  - path is derived from tree keys when no path is given (`.get(path?)` etc.),
  - response status defaults to 200.
- `.response(schema, { status?, contentType?, headers?, description? })`
  declares a body response. `.response({ status?, headers?, description? })`
  declares a bodyless response. Options and schemas are told apart by the
  Standard Schema `~standard` property.
- `.streamResponse(schema, { status?, headers?, description? })`.
- Request segments: `.params()`, `.query()`, `.headers()`,
  `.body(schema, { contentType? })`.

## Handler results

- A returned object with a numeric `status` is a response envelope
  `{ status, body?, contentType?, headers? }`. `status` is required in
  returned envelopes.
- Any other value is the 200 body: JSON, or an SSE stream for async iterables.
- The same rule applies with and without declared responses, at runtime and in
  type inference (per union member, `status extends number`).
- There is no `{ data, contentType }` shape. Non-JSON content types use an
  envelope.
- A non-literal `status: number` is not special-cased; it infers `number`.

## Extracted contract

- `extractContract(routes)` walks a route tree at runtime and keeps only, per
  route: `method`, absolute `path` (tree-key paths resolved), and the request
  `contentType` when a body is declared.
- No responses, schemas, metadata, OpenAPI details or handlers are extracted.
- Extraction executes the server route module. It runs at build time (script
  or bundler macro); the client imports the route tree type only.
- The client keeps full validation when given a shared contract that carries
  schemas (contract-first).

## Client

- Every call returns an envelope `{ status, body, headers, rawHeaders }`.
- Calls take explicit `{ params, query, body, headers }`.
- No helpers for unwrapping bodies; users write them if needed.
- Any status is returned as an envelope. Statuses are only checked against
  declared responses when the contract carries them.
- `text/event-stream` responses are always parsed as library streams; codecs
  are not consulted for them. The client types any response declared with that
  content type as `AsyncIterable<SseEvent<unknown>>`.
- `headers` is read from the raw response when no header schema is known.
- `InferClientSuccess` / `InferClientError` split envelopes on 2xx. A
  non-literal `number` status matches both.
- TanStack Query: non-2xx throws into the error channel; `data` is the 2xx
  envelope for every route.

## Accepted tradeoffs

- More verbose client calls and results for simple routes.
- Unexpected responses (proxies, misconfigured servers) do not throw; the
  types trust the server, as they already do for bodies.
- Bodies with a numeric `status` field must be wrapped in an envelope.
- User codecs cannot handle `text/event-stream`.
- Follow-up: whether error-channel responses should be handled differently.
