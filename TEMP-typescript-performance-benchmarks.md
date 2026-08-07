# Temporary Note: TypeScript Performance Benchmarks

## Concern

The current contract DSL uses TypeScript for both useful inference and broad
static validation. The useful inference is core product value, but validation
types may become expensive on large contracts.

## Pressure Points

Likely expensive areas in `packages/core/src/contract/route.ts` and `packages/core/src/contract/define.ts`:

- recursive whole-contract validation walkers
- repeated response-key mapping for success/error/client/server response types
- `SuccessfulResponseKeys`, status parsing, and union checks
- request segment flattening across body/query/params/headers
- optional/required key inference for request schema records
- Standard Schema inferred input/output checks used to validate route segment
  constraints

The body/custom/stream descriptors themselves should be relatively cheap if
they remain shallow discriminated unions.

## Possible Design Rule

Use TypeScript primarily to infer the happy path:

- client request shapes
- server handler inputs
- response/status unions
- React Query hook shapes
- WebSocket send/receive message types

Move validation-only checks to runtime if benchmarks show editor/typecheck pain.
Validation types that only produce error objects are candidates for removal or
runtime-only enforcement.

## Benchmark Ideas

Create generated contracts at different sizes:

- 100 routes
- 300 routes
- 1000 routes

Compare variants:

- JSON-only routes
- mixed request body/query/params/headers
- mixed responses, streams, custom bodies, and WebSockets
- current validation-heavy route/router return types
- route/router validating input but returning cheaper contract types

Measure:

```sh
tsc -p tsconfig.json --extendedDiagnostics
```

Also compare TypeScript 6/current stable against TypeScript 7/native when
available in the project, because TS7 may provide much more headroom but does
not remove the value of simpler public types by being more capable at bruteforcing the type checking.
