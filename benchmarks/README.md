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

Pass case names, or parts of them, to run only those cases:

```sh
pnpm bench:http query middleware
```

Set `BENCH_RUNTIME` to serve the routes with `createApp()` from `@rest-rpc/server/node`
instead of `createApp` on Bun's native router: `node` runs it on Node, and
`bun-node` on Bun's `node:http`.

```sh
BENCH_RUNTIME=node pnpm bench:http
```

Set `BENCH_SERVER` to load an executable compiled from `runtime/http.ts`
instead, such as one built with `bun compile`:

```sh
bun compile benchmarks/runtime/http.ts --outfile server
BENCH_SERVER=./server pnpm bench:http
```

It prints req/s and the server memory before and after each case. A run
takes about a minute. Compare runs on the same machine only.
