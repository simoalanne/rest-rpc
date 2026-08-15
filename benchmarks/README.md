# rest-rpc benchmarks

This private workspace contains generated benchmark fixtures that exercise the
library as a downstream consumer.

The first pass only measures TypeScript checker cost for contract declaration
across the built-in type-only schema helper and the main supported validation
libraries. Run it from the repository root:

```sh
pnpm bench:typecheck -- "Test with all validations present"
```

The root command builds packages first because the generated fixtures consume
the workspace packages through their published `dist` declaration files.

The message is required and is used as the result filename slug:

```sh
benchmarks/results/typecheck/test-with-all-validations-present.md
```

The scripts generate fixtures under `generated/` and run `tsc --noEmit
--extendedDiagnostics` for each schema library and route count.

Results are written to Markdown files under `results/typecheck/`, with
`results/typecheck/latest.md` updated to the most recent run.
