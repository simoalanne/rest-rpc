---
name: contract-first-api
description: Use this skill when working with the contract-first-api TypeScript library, including a shared API contract, typed Express servers, typed API clients, React Query adapters, or OpenAPI generation from routes. Do not use it for unrelated API stacks or when the project does not use contract-first-api packages.
---

# contract-first-api

Use this skill for tasks in repositories that use `contract-first-api`.

## When To Use

- Creating or updating the shared API contract with `@contract-first-api/core`
- Wiring the API contract into Express with `@contract-first-api/express`
- Building typed clients with `initClient()` from `@contract-first-api/core`
- Using the React Query helpers from `@contract-first-api/react-query`
- Generating OpenAPI documents with `@contract-first-api/openapi`
- Debugging how these packages fit together across backend, frontend, and shared code

## When Not To Use

- The project uses a different contract or RPC library
- The repo already has clear local `contract-first-api` usage patterns and the task can be completed by following those patterns without extra library-specific guidance
- The task is generic TypeScript, Express, or React Query work with no `contract-first-api` usage
- The task is about OpenAPI tooling unrelated to `contract-first-api/openapi`

## Workflow

1. Identify which package or packages the task touches.
2. Search the local codebase for existing `contract-first-api` usage and follow clear established patterns first.
3. Read [references/overview.md](references/overview.md) only when the task spans multiple packages or the overall architecture is unclear.
4. Read only the package reference files needed for the task when local examples are missing, inconsistent, or too narrow:
   - [references/core.md](references/core.md)
   - [references/express.md](references/express.md)
   - [references/api-client.md](references/api-client.md)
   - [references/react-query.md](references/react-query.md)
   - [references/openapi.md](references/openapi.md)
5. Preserve the library's contract-first model:
   - one shared API contract is the source of truth
   - integrations consume the API contract rather than redefining request and response types
   - request fields are flattened for service and client usage
6. Prefer narrow changes that match the package's documented API and examples already present in the repository.

## Package Selection

- Use `core.md` for defining the API contract, route modes, and helper types.
- Use `express.md` for route registration, request validation, middleware, raw body handling, context creation, streams, and websockets on the server.
- Use `api-client.md` for core client request shape, base URL rules, headers, timeouts, and response handling.
- Use `react-query.md` for hook usage, cache helpers, and how the React Query client uses the API contract and core client options.
- Use `openapi.md` for JSON routes export, transform hooks, and document customization.

## Invariants

- The API contract is a plain TypeScript object defined once and shared across packages.
- Request field names must be unique across `body`, `query`, and `params` within one route.
- Route mode changes behavior across integrations:
  - `json` is the default
  - `raw` does not define an API-contract-managed request body
  - `stream(schema)` models NDJSON responses
  - `websocket` models bidirectional messages
- `@contract-first-api/openapi` only documents JSON routes.
- Shared path prefixes belong in the contract so adapters and clients consume
  the same normalized route paths.

## Output Style

- Prefer existing package APIs and patterns over inventing wrappers.
- Keep examples concrete and close to the repository's documented usage.
- If documentation and code behavior seem inconsistent, inspect the package source and tests before assuming the docs are complete.
