# AGENTS.md

- This repo is `contract-first-api`, a TypeScript library for defining one shared API contract and deriving typed Express handlers, runtime clients, React Query helpers, and OpenAPI documents from it.
- The project is not stable and does not have meaningful adoption yet. Breaking changes and broad public API refactors are acceptable when they make the library cleaner.
- Public API changes must keep all user-facing docs in sync: root/package READMEs, `.agents/skills/contract-first-api` skill files, and the `example` workspace.
- The skill files are mainly consumer guidance for people using this library from other projects. Do not treat them as only local contributor notes.
- Workspace packages resolve each other through built declaration files. After changing exported package APIs, run `pnpm run typecheck` or build packages before typechecking dependents; package-only or stale-build typechecks can be misleading.
- `pnpm run lint` and `pnpm run check` are developer commands and may write safe Biome fixes automatically. `pnpm run check` should fix first, then typecheck and test.
- Use `pnpm run lint:verify` for a read-only whole-repo Biome check, `pnpm run check:verify` for the read-only lint plus typecheck/test verification pass, `pnpm run lint:staged` or `pnpm run lint:write` for staged-file fixes, `pnpm run typecheck` for declaration build plus workspace typecheck, and `pnpm run test` for tests.
- Treat Biome formatting/import ordering as mechanical. Do not manually fix, analyze, or report auto-fixable formatting/import diffs unless they reveal a real behavior change.
- When Biome writes files, focus follow-up work on real remaining failures from read-only verification, typecheck, or tests. Do not repeatedly rerun commands just to inspect formatter-only churn.
- Pre-commit hooks must first run staged-file Biome fixes with restaging, then run a separate read-only verification pass. Keep hook jobs sequential so verification runs only after any staged-file rewrites are back in the index.
