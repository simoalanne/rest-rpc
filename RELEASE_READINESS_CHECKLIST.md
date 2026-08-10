# Release Readiness Checklist

Temporary working checklist for getting `rest-rpc` ready for a v1 release.

## Must Be Done

- Freeze feature scope for v1 unless a change fixes a real release blocker.
- Add focused missing `@rest-rpc/server` unit tests for route matching, router implementation validation, HTTP response normalization, `ContractResponseError`, and websocket lifecycle behavior.
- Add focused missing `@rest-rpc/core` unit tests that are lacking coverage.
- Add a shared real-HTTP integration suite for server adapters using the real `@rest-rpc/core` fetch client against real listening servers where practical.
- Cover Express, Hono, Fastify, and the Next server handler boundary with the shared integration scenarios.
- Audit public package exports and decide which names are part of the supported v1 API.
- Ensure user-facing exports are available from package roots unless there is a deliberate subpath-only reason.
- Keep subpath exports as intentional domain boundaries, not file-level deep imports.
- Add package reference docs that briefly describe exports for each package.
- Update happy-path docs separately from reference docs.
- Set up CI for install, lint verification, typecheck, tests, and package builds.
- Replace ad-hoc local publishing with CI/CD publishing.
- Configure synchronized package versioning and release workflow, likely with Changesets.
- Add or update repository hygiene files: `CONTRIBUTING.md`, `SECURITY.md`, PR template, and issue templates.
- Confirm package build output contains only intended JS and declaration files.
- Run a source audit for public API shape, naming, package boundaries, error messages, and adapter behavior before release.

## Continuous Work Or Work To Be Done Soon

- Improve tests where they lock down real regression risk rather than chasing line coverage.
- Add type tests for non-obvious public inference, especially adapter contexts, websocket handler context, and Next server helper overloads.
- Add concise JSDoc to public exports as the API surface settles.
- Keep docs updated alongside public API changes.
- Add small adapter-specific integration tests for behavior the shared HTTP suite cannot express cleanly.
- Add real websocket integration tests for adapters where practical.
- Improve DRY in tests by extracting repeated contracts, implementations, server startup helpers, and mocks when they are scaffolding rather than the subject of a test.
- Keep edge-case test fixtures inline when the exact route/schema shape is important to the test.
- Add package export checks or docs checks if exported names and reference docs start drifting.
- Continue reviewing file naming and module boundaries as the code evolves.

## Leave For Later Once Everything Else Is Done

- Full generated API reference from JSDoc or TypeDoc/API Extractor.
- Exhaustive E2E suite across React Query, Next-specific behavior, and websocket clients.
- Broad websocket coverage for every adapter/runtime combination.
- Perfect coverage targets or coverage gates.
- Large source reorganizations that do not change public behavior.
- Additional features that are not needed for v1.
- Advanced release automation beyond the basic reliable CI/CD publish path.
- Extra docs polish after the core guides and reference pages are accurate.
