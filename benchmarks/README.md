# rest-rpc benchmarks

This private workspace contains generated benchmark fixtures that exercise the
library as a downstream consumer.

The first pass only measures TypeScript checker cost for contract declaration
across the built-in type-only schema helper and the main supported validation
libraries. Run it from the repository root:

```sh
pnpm run bench:typecheck
```

The scripts generate fixtures under `generated/` and run `tsc --noEmit
--extendedDiagnostics` for each schema library and route count.
