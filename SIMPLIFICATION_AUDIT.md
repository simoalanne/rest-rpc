# Simplification Audit

Temporary working file. Delete it once the cleanup is done.

Findings are ranked by maintainability payoff relative to effort, highest first. Each group is meant to be one refactor. Only `@rest-rpc/server/node` and the package roots are public, so the other subpath barrels count as internal.

Confidence: **certain** means the change keeps behavior or fixes a contradiction with the code. **Decision** means a trade-off you need to make.

---

## 1. Docs that contradict the code

Most are one-line edits.

| Location                | What's wrong                                                                                        | Change                                                                                        | Confidence |
| ----------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| `CONTRIBUTING.md:28-35` | Repeats the Public API rules from `AGENTS.md` and leaves out the `@rest-rpc/server/node` exception. | Add the exception, or replace the section with a pointer to `AGENTS.md` so there is one copy. | decision   |

## 3. The client response reader takes a request function only to call it once

- **`packages/core/src/client/response.ts:209-235`, `packages/core/src/client/initClient.ts:91-104`**
  - Problem: `fetchResponse` receives `request: RouteRequestFn` plus the call arguments, and its first line calls `request`. Only `initClient` passes a real function. The tests in `response.test.ts` pass `async () => response`. This seam adds a type (`RouteRequestFn`) and two wrapper closures in `initClient`.
  - Change: have it take the received `Response` instead: `readResponse(rawResponse, route, validate, codecs)`. `initClient` then calls `readResponse(await executeRequest(route, args, requestOptions), …)`, and the tests pass the `Response` directly. **certain**

## 4. Server re-implements core helpers

One "use or move to core" refactor covers all of these.

- **`packages/server/src/builder/implement.ts:16-17,36-47`**
  - Problem: has its own `mapContractRoutes` and an `isContractRoute` wrapper over `isRouteLeaf`. Core's `mapContractRoutes` (`traversal.ts:35`) already does this, and both callers only read `route["~restrpc"]`.
  - Change: use core's version and delete the local copies. **certain**
- **`packages/server/src/builder/routeBuilder.ts:108-119`**
  - Problem: `handler()` repeats core's `defaultRouteState` (`core/src/contract/routeBuilder.ts:129`): POST, `path: undefined`, `responses: {}`.
  - Change: export `defaultRouteState` through the internal contract barrel, or make it a protected builder method, and reuse it. **certain**
- **`packages/server/src/pipeline/createApp.ts:136-140`**
  - Problem: the mount path join is `joinPrefix` from `core/src/contract/path.ts:4`.
  - Change: export `joinPrefix` and reuse it. **certain**
- **`IsUnion`, defined in `core/src/contract/request.ts:73`, `core/src/contract/response.ts:53` and `server/src/builder/routeBuilder.types.ts:199`**
  - Problem: three identical copies.
  - Change: move it to `core/src/utils/typeUtils.ts`, next to `EmptyObject`. In the same pass, replace `request.ts:116` `EmptyRequest` and the inline `Record<never, never>` at `request.ts:183` with `EmptyObject`. **certain**

## 5. OpenAPI internals exported for tests

- **`packages/core/src/openapi/operation.ts:114,162,180,297-300,155`**
  - Problem: `createParameters`, `createRequestBody` and `createResponse` are exported only for `operation.test.ts`. `createOperation`'s `routePath = []` default and the `route.path ?? ""` fallback exist so those tests can pass raw declarations. The real caller always passes a resolved path and a `routePath`.
  - Change: test through `createOpenApiDocument`, as `document.test.ts` already does. Then unexport the helpers, make `routePath` required, and type `route` as `RouteDeclaration & { path: string }`. **certain**, medium effort because of the test rewrite.
- **`packages/core/src/openapi/operation.ts:87-101,132-135`**
  - Problem: `getRequiredSchemaKeys` returns a `known`/`unknown` union, but its caller treats `unknown` the same as known-with-no-keys.
  - Change: replace it with `Array.isArray(jsonSchema.required) ? jsonSchema.required : []` and delete `SchemaRequiredKeys`. **certain**

## 6. `sse()` serializes event data up to three times

- **`packages/server/src/pipeline/sse.ts:93`, `packages/server/src/pipeline/validation.ts:240-244`**
  - Problem: `sse()` stringifies `data` only to check it. `validateResponseStreamChunks` then re-wraps each validated chunk with `sse()`, which checks the metadata and stringifies `data` again. Framing (`sse.ts:53`) stringifies it a third time. The framing step already throws the same `TypeError` during stream iteration, which is where an error thrown by the handler's `sse()` call would surface anyway.
  - Change: delete the eager `serializeData(event.data)` in `sse()`. In `validation.ts`, yield `{ ...chunk, data }` (the spread keeps the brand) instead of calling `sse()` again. Move the assertion in `sse.test.ts:56-63` to `frameSseStream`. **decision**: `sse()` would no longer throw at once for data that isn't JSON when called outside a stream.

## 7. Server module boundaries

- **`packages/server/src/pipeline/resolveRouteError.ts:9`**
  - Problem: `errorBody` is defined here but only used by `serializeHttpRouteResult.ts:84`.
  - Change: move it there. **certain**
- **`packages/server/src/pipeline/handleHttpRoute.ts:31-63`**
  - Problem: `HandleOptions` and `CatchAllHandleOptions` are the public options of compiled routes and the catch-all handler. They live in the route executor module, and `compileRoutes.ts`, `createApp.ts` and `node/adapter.ts` import them from it.
  - Change: move them to `compileRoutes.ts`, next to `CompileRoutesOptions` and `FetchRoute`, and update `index.ts:31-34`. **certain**
- **`packages/server/src/pipeline/validation.ts:215-222`**
  - Problem: `validateResponseHeaders` accepts `schema | undefined` and guards against it. Both callers (`handleHttpRoute.ts:138`, `resolveRouteError.ts:290`) always pass a defined declaration.
  - Change: take `ResponseHeadersSchema | undefined` directly (pass `.headers` at the call sites), leaving one guard. **certain**

## 8. Small core simplifications and unjustified guards

- **`packages/core/src/contract/path.ts:22-37`**
  - Problem: `pathParamNameFromCaptures` throws an error that can't happen, because the regex always captures exactly one group.
  - Change: inline it as `match[1] ?? match[2]`. **certain**
- **`packages/core/src/contract/routeBuilder.ts:303-314`**
  - Problem: `headers()` writes out by hand what `addRequestSegment` (`:168`) does.
  - Change: widen `addRequestSegment`'s segment type to include `"headers"` and call it. **certain**
- **`packages/core/src/contract/extract.ts:45`, `packages/core/src/client/response.ts:250-251`**
  - Problem: `extractContract` leaves out `responses` when it's empty, even though `RouteDeclaration` requires it. This forces the `?? {}` and `?.` guards in the client.
  - Change: always emit `responses`, then drop the guards. **decision**: each route with inferred responses gains `"responses":{}` in the extracted JSON.
- **`packages/core/src/codecs/operations.ts:21`, `packages/server/src/pipeline/handleHttpRoute.test.ts:423-428`**
  - Problem: `isAsyncIterable` also checks that `[Symbol.asyncIterator]` is a function. That only guards an object with a non-function `Symbol.asyncIterator` key, which no realistic handler returns, and it has a dedicated test.
  - Change: drop the check and the test. **decision**

## 9. Repo scripts and config leftovers

- **`package.json:16,18,20,27,32`**
  - Problem: these scripts are pure aliases: `lint:verify` (= `lint`), `check:verify` (= `check`), `api:docs` (= `api:docs:verify`), `lint:write` (= `lint:staged`), and `typecheck:workspace` (only called by `typecheck`).
  - Change: delete the aliases and point `.github/workflows/ci.yml:37` at `pnpm run check`. **certain**
- **`package.json:26`**
  - Problem: `release:github:notes` passes `--notes`, which `scripts/create-github-release.ts` never reads.
  - Change: drop the flag. **certain**
- **`tsconfig.json:9`**
  - Problem: `experimentalDecorators` is set, but the repo has no decorators.
  - Change: delete it. **certain**
- **`tsconfig.build.json:10`**
  - Problem: it excludes `**/*.type-test.ts`, but no such files exist. Type tests use `.test-d.ts`.
  - Change: delete the entry. **certain**
- **`scripts/check-public-api-docs.ts:143,228`**
  - Problem: the `packageDir` parameter of `checkEntryPoint` is unused, and `checkWorkspace` is exported but never imported.
  - Change: delete the parameter and the `export`. **certain**

## 10. Doc trimming

Overlap and verbosity, not errors.

- **`content/docs/contract-first.mdx:14-62`**
  - Problem: repeats the declare, implement and client code from `contract-first-quickstart.mdx`. The two pages also implement routes differently: the quickstart uses `implement(api.todos.create)` and this page uses `implement(api).todos.create`.
  - Change: keep only what this page adds (the implementer tree, context and middleware on the root and on single routes, reserved keys), link to the quickstart for the full example, and pick one `implement` style. **decision**
- **`content/docs/server/framework-integration.mdx:6-25`**
  - Problem: "Scope of rest-rpc" is three paragraphs of positioning prose, with typos ("consepts", "thats"), before any integration content.
  - Change: cut it to one or two sentences, or move it to the landing page. **decision**
- **`content/docs/openapi.mdx:86-122`**
  - Problem: a long second `transformParameter` example for a Zod-meta workaround overlaps the Transform Hooks example (`:170-199`).
  - Change: keep one of them. **decision**
- **`content/docs/client/fetch-client.mdx:252-265`**
  - Problem: the Client Options example repeats the `globalHeaders` authorization provider that Global Headers (`:309-323`) shows next.
  - Change: drop `globalHeaders` from the first example. **certain**
- **`content/docs/http-behavior/schemas.mdx:177-188`, `content/docs/http-behavior/serialization.mdx:111-127`**
  - Problem: the server option examples use `compileRoutes`, while the rest of the docs present `createApp` as the default path. The options are the same.
  - Change: show `createApp`. **decision**, low payoff.

---

## Declaration emit check

This answers whether the export trims break consumers that compile with `declaration: true`.

**Setup.** The packages were copied into a scratch directory and built. Their `exports` were then swapped to `publishConfig`, so they resolve to `dist` `.d.ts` files the way a published install does. A consumer with `declaration: true` exported values inferred from every API: core and server builders, `routeError`, completed routes with errors, headers, media types, streams, prefixes, metadata and OpenAPI details, `implement`, `createApp`, compiled routes, `call`, `initLocalClient`, `initClient`, `extractContract`, `safe`, `createOpenApiDocument`, and TanStack utils. The harness is `run.sh` and `summarize.sh` in `/tmp/claude-1000/-home-simo-Downloads-rest-rpc/87169b07-1754-40ec-bf3f-ef789d41a135/scratchpad/decl`.

**Results.**

- Original barrels: every export that emits today still emits.
- Trimmed barrels: `RouteErrorClassFor`, `RouteBuilderKind`, `OpenApiRouteOptions` and `FetchResponseFn` turned out to be required. With those four kept, the result matches the original barrels.

**Limits.**

- The check only covers the shapes in the consumer file.
- The exports that already fail (listed below) can't show which names they would need once fixed.
- Dropping `export` from server symbols that are only used in their own module (end of finding 2), and moving `HandleOptions` or `errorBody` (finding 7), don't affect consumers. Those symbols are either unreachable from any entry point or are re-exported from the root.

### Not a reduction, but found by the check

These already fail declaration emit today, before any change, with TS2883, TS4023 or TS2527:

| Exported value                                                                                                       | Unnameable type                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A partially built core or server route (`route.prefix(…)`, `route.get(…).query(…)`, a shared base)                   | `WithPrefix`, `WithHttpMethod`, `WithRequest`, `WithBody`, `WithResponse`, `WithError`, `WithMetadata` in `core/src/contract/routeBuilder.types.ts`, plus `ServerRouteBuilder` |
| A contract-first contract object (`export const api = { todos: { … } }`, the documented pattern)                     | same `With*` types                                                                                                                                                             |
| `route.$context<…>()`, `route.middleware(…)`                                                                         | `ServerRouteBuilder`, `ReusableMiddlewareRequest`                                                                                                                              |
| `implement(contract)`, its `$context()`, an unhandled implementer leaf                                               | `ImplementerRootMethods` (not exported anywhere), `HandlerMethodFor`, `MiddlewareRequest`, `ReusableMiddlewareRequest`                                                         |
| `createTanstackQueryUtils(…)`                                                                                        | `typeof skipToken`, an inaccessible `unique symbol`                                                                                                                            |
| A handler annotated `InferServerHandler<typeof declaration>` (the pattern in `route-builder.mdx:525`), when exported | the declaration's builder type                                                                                                                                                 |

Completed server routes, route trees of them, apps, compiled routes, clients and extracted contracts emit fine.

This matters mostly for contract packages in monorepos that use `declaration` or `composite`. The fix would add exports, so it falls outside this audit. It's a decision whether to support this use at all, and if so, whether to export the `With*` builder state types from the contract barrel or annotate the builder methods with nameable types.

## Considered and left out

- **Node and Fetch `createCatchAllHandler`** repeat about 10 lines of mount-path and match handling. A shared helper would save little and couple the two runtimes.
- **`MaybePromise` and the `instanceof Promise` fast paths** are deliberate. The benchmarks in `benchmarks/runtime` exist for them.
- **`validateStandardSchema`**, the one-line wrapper, gives a typed result that 11 call sites rely on.
- **The `createUtils.ts` / `createTanstackQueryUtils.ts` split** in tanstack-query keeps the untyped runtime apart from the large type layer, which is reasonable.
- **The README** is about 650 lines against the 500 target, but no section stood out as removable.
