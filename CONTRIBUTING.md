# Contributing

Thanks for your interest in improving `rest-rpc`. Read below for details on how to contribute to the project. All kinds of contributions are welcome, including bug reports, feature requests, documentation improvements, and code contributions.

## Requirements

- Node 24 or later.
- pnpm for dependency management.

## Workflow

1. Fork the repository.
2. Clone your fork locally.
3. Install dependencies:

```sh
pnpm install
```

4. Create a branch for your change.

```sh
git checkout -b my-feature-branch
```

5. Make your changes.

## Public API

The public API of each published package is its root entry point. Subpath-only exports are internal
unless they are also re-exported from the package root.

- Do not use wildcard exports from package root entry points. Export each public symbol explicitly.
- Every package root export must have a TSDoc comment on the declaration itself, not on the re-export.
- Root-exported functions must use regular function declarations so generated API references can identify them as functions.

## Verification

6. Verify the relevant behavior:

```sh
pnpm run lint
pnpm run typecheck
pnpm run test
```

7. If the change affects published package behavior, types, exports, or docs-visible functionality, add a changeset:

```sh
pnpm changeset
```

8. Update documentation for user-facing changes.
9. Commit your work. Prefer conventional commit messages. However as commits will be squashed, the PR title and description are more important than the commit messages. Use the PR title and description to describe your change in detail.
10. Push your branch to your fork.
11. Open a pull request.
