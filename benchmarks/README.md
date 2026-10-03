# rest-rpc type benchmarks

Measures TypeScript checker cost of the route builder and inference types on
generated route trees. Run it before and after changing builder or inference
types to check that a type that reads better does not check slower.

```sh
pnpm bench:typecheck -- --label before
# change types
pnpm bench:typecheck -- --label after --baseline before
```

`--label` defaults to the current commit. Results are saved to
`results/<label>.json`, and `--baseline` adds percentage changes against an
earlier result. Types and instantiations are deterministic, so compare those
first; check time varies between runs.

Fixtures are generated under `generated/` and import the workspace packages'
sources. Each fixture also evaluates every client call signature, so request
and response inference is measured, not just the builder:

- `contract-http`: explicit routes with params, query, body, headers, metadata
  and declared responses.
- `contract-procedure`: procedures with flat input and plain output.
- `contract-implemented`: a contract implemented with `implement`.
- `server-http`: server-first explicit routes with inferred status responses.
- `server-procedure`: server-first procedures.
