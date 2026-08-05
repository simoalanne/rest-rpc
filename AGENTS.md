# AGENTS.md

- This repo is `contract-first-api`, a TypeScript library for defining one shared API contract and deriving typed Express handlers, runtime clients, React Query helpers, and OpenAPI documents from it.
- The project is not stable and does not have meaningful adoption yet. Breaking changes and broad public API refactors are acceptable when they make the library cleaner.
- Public API changes must keep all user-facing docs in sync: root/package READMEs, `.agents/skills/contract-first-api` skill files, and the `example` workspace.
- The skill files are mainly consumer guidance for people using this library from other projects. Do not treat them as only local contributor notes.
- Workspace packages resolve each other through built declaration files. After changing exported package APIs, run `pnpm run typecheck` or build packages before typechecking dependents; package-only or stale-build typechecks can be misleading.
- Use `pnpm run lint` for a read-only whole-repo Biome check, `pnpm run lint:write` only for staged-file fixes, `pnpm run typecheck` for declaration build plus workspace typecheck, `pnpm run test` for tests, and `pnpm run check` for the full verification set.
- Treat Biome formatting/import ordering as mechanical. Do not spend time analyzing or reporting formatter-only diffs; trust Biome unless it changes behavior.
- Write-formatting commands must stay staged-file scoped. Once the repo is formatted, future commits should keep new code formatted without rewriting unrelated files.
- Pre-commit hooks should first run staged-file Biome fixes, then run repo-wide read-only verification. Keep hook jobs sequential so checks run after any staged-file rewrites.
