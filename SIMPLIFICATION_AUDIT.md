# Simplification Audit

Temporary working file. Delete it once the cleanup is done.

Findings are ranked by maintainability payoff relative to effort, highest first. Each group is meant to be one refactor. Only `@rest-rpc/server/node` and the package roots are public, so the other subpath barrels count as internal.

Confidence: **certain** means the change keeps behavior or fixes a contradiction with the code. **Decision** means a trade-off you need to make.

---

## 10. Doc trimming

Overlap and verbosity, not errors.

- **`content/docs/server/framework-integration.mdx:6-25`**
  - Problem: "Scope of rest-rpc" is three paragraphs of positioning prose, with typos ("consepts", "thats"), before any integration content.
  - Change: cut it to one or two sentences, or move it to the landing page. **decision**
- **`content/docs/openapi.mdx:86-122`**
  - Problem: a long second `transformParameter` example for a Zod-meta workaround overlaps the Transform Hooks example (`:170-199`).
  - Change: keep one of them. **decision**
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
