---
name: contract-first-api
description: Use this skill when working with the contract-first-api TypeScript library, including shared contract trees, typed Express servers, typed API clients, React Query adapters, or OpenAPI generation from contracts. Do not use it for unrelated API stacks or when the project does not use contract-first-api packages.
---

# contract-first-api

Use this skill for tasks in repositories that use `contract-first-api`.

## When To Use

- Creating or updating shared contract trees with `@contract-first-api/core`
- Wiring contract trees into Express with `@contract-first-api/express`
- Building typed clients with `@contract-first-api/api-client`
- Using the React Query adapter from `@contract-first-api/react-query`
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
   - one shared contract tree is the source of truth
   - integrations consume contracts rather than redefining request and response types
   - request fields are flattened for service and client usage
6. Prefer narrow changes that match the package's documented API and examples already present in the repository.

## Package Selection

- Use `core.md` for defining contracts, contract modes, metadata, and helper types.
- Use `express.md` for route registration, request validation, middleware, raw body handling, context creation, streams, and websockets on the server.
- Use `api-client.md` for request shape, base URL rules, headers, timeouts, and error handling.
- Use `react-query.md` for hook usage, cache helpers, and how the adapter wraps the API client.
- Use `openapi.md` for JSON contract export, transform hooks, and document customization.

## Invariants

- Contracts are plain TypeScript objects defined once and shared across packages.
- Request field names must be unique across `body`, `query`, and `params` within one contract.
- Contract mode changes behavior across integrations:
  - `json` is the default
  - `raw` does not define a contract-managed request body
  - `stream` models NDJSON responses
  - `websocket` models bidirectional messages
- `@contract-first-api/openapi` only documents JSON contracts.
- Backend route prefixes and client base URLs must stay aligned.

## Output Style

- Prefer existing package APIs and patterns over inventing wrappers.
- Keep examples concrete and close to the repository's documented usage.
- If documentation and code behavior seem inconsistent, inspect the package source and tests before assuming the docs are complete.
