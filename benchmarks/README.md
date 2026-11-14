## Typecheck Benchmarks

## How to run

```sh
pnpm bench:typecheck
```

Compare `Types` and `Instantiations` before and after a change to the types.
They do not change between runs. Check time varies between runs.

## HTTP Benchmarks

`runtime/http.ts` serves a few small routes with `createApp`, and
`runtime/run.ts` loads each with [bombardier](https://github.com/codesenberg/bombardier),
starting a fresh server per case. Requires `bun` and `bombardier` on `PATH`.

```sh
pnpm bench:http
```

It prints req/s and the server memory before and after each case. A run
takes about a minute. Compare runs on the same machine only.
