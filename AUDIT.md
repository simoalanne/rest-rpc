# Codebase audit: duplication and complexity

Scope: non-test sources under `packages/*/src`. Completed items have been removed from this file. Type-only re-exports from `@rest-rpc/core/contract` without outside consumers (e.g. `RouteResponses`, `ServerRequest`, `ResponseHeaders`) are kept on purpose, because downstream declaration emit may need them to name inferred types.

Items are grouped by effort, cheapest first. Every item has a value note:

- **High:** removes drift risk across packages, or code that is touched often.
- **Medium:** noticeably shortens or clarifies code that is read regularly.
- **Low:** local tidy-up.

## Tier 1: cheap

### 1.1 Share the last duplicated helpers

**Status: done.** `Merge`, `EmptyObject`, `MaybePromise` and `isAsyncIterable` are exported from the internal `@rest-rpc/core/utils` subpath. Server and tanstack-query import them from there, and the server copy of `typeUtils.ts` is gone.

Each package still keeps its own copy of these helpers, because sharing them needs a new export:

- `typeUtils.ts` (`Merge`, `EmptyObject`): `core/src/typeUtils.ts` and `server/src/typeUtils.ts` are identical
- `MaybePromise`: `core/src/standard-schema/type.ts`, `server/src/routeBuilder.types.ts`
- `isAsyncIterable`: `server/src/implicitResponse.ts`, `tanstack-query/src/createUtils.ts`

These could be exported from `@rest-rpc/core/utils` or similar.

**Value: low.**

### 1.2 Share the `"~restrpc"` route guards

**Status: done.** `isRouteLeaf` in `core/contract/traversal.ts` is the one route-leaf check, used by core traversal, tanstack-query and `implement` (which keeps a typed wrapper for its tree). `isImplementedRoute` in `server/match.ts` builds on it and is exported from `@rest-rpc/server`, so Nest calls it instead of inlining the check.

Five places check for a `"~restrpc"` key to detect a route, in two variants:

- **Route leaf:** `core/contract/traversal.ts` (`isContractRouteDeclaration`), `tanstack-query/createTanstackQueryUtils.ts` (`isRouteDeclaration`), `server/implement.ts` (`isContractRoute`, which skips the object/null check because its input is typed as a tree)
- **Implemented route** (leaf whose state has a `handler`): `server/match.ts`, plus the same condition inlined in `nest/routeInterceptor.ts`

**Suggestion:** add `isRouteLeaf` to `@rest-rpc/core/contract` and `isImplementedRoute` to `@rest-rpc/server`, built on it. Nest then calls the server guard instead of inlining it.
**Value: low to medium.** Each guard is tiny, but they encode what counts as a route in the tree, and the server and Nest copies of the implemented-route check must stay identical.

## Tier 2: medium

These changes cross package boundaries or need test updates.

### 2.1 Share route rules between client and server

Rules that decide the wire format or the served path are derived separately in each layer. If they diverge, the client and server disagree.

- **Plain output / flat input:**
  - Runtime: `server/handleHttpRoute.ts` (`usesPlainOutput`, `getHandlerRequestFields`), `core/client/initClient.ts` (`flatInput`, `plainOutput`), `tanstack-query/createTanstackQueryUtils.ts` (`output === "response"`, a slightly different rule)
  - Type level: `UsesPlainOutput` (`server/implicitResponse.types.ts`), `UsesFlatInput` (`core/contract/request.ts`), and ad-hoc `E extends { output: "output" }` checks in `core/contract/response.ts` and `core/client/response.ts`
- **Default procedure path:** `` `/${path.join("/")}` `` is derived in `core/contract/traversal.ts`, `core/client/initClient.ts`, `server/match.ts` and `core/generate/generateContractFromType.ts`.

**Suggestion:** export `usesPlainOutput` / `usesFlatInput` with matching `UsesPlainOutput` / `UsesFlatInput` types, and `resolveRoutePath(route, treePath)`, once from `@rest-rpc/core/contract`. Optionally, rebase the server and tanstack tree walkers on `contractRouteEntries` / `mapContractRoutes`, which also removes most of the route guards in 1.2. If 3.1 is done first, the mode predicates become one-line checks.
**Value: high.**

### 2.2 Adapter duplication

- **Response serialization:** four places resolve a codec with `[...bodyCodecs, ...defaults]`, serialize the body, copy the serializer's headers and the result headers, and handle `serialized.contentType` being `undefined`, `null` or a string: `fetch/src/response.ts`, `node/src/response.ts`, `fastify/src/registerRoutes.ts` (a near-verbatim copy of `writeNodeResponse`) and `nest/src/routeInterceptor.ts`. Fetch throws a clear error when no serializer matches; the other three use `codec!.serialize!`.
  **Suggestion:** add `serializeHttpRouteResult(result, codecs, defaultCodecs)` to `@rest-rpc/server`, returning `{ status, headers, contentType, body }`. Writing to the native response stays in each adapter. **Value: high.** This is the largest duplicated runtime block in the adapters.
- **`index.ts` boilerplate:** all six adapter entry points repeat `DefaultContext`, `InferServerHandler`, `route`, `implement` and an identical re-export block. A shared generic `AdapterApi<TFields, TContext>` type would cut the cast noise in `route` and `implement`. The per-package `DefaultContext` interface and the TSDoc on each export have to stay. **Value: low.**

## Tier 3: large

Type-level or design-level changes, to be reviewed last. For the type-level items, hover output and type tests are the review criteria.

**Type-check benchmark first.** The repo has no type-checker performance benchmark right now. A basic `benchmarks/` package (generated fixtures plus a typecheck runner) existed until it was removed in `737b7a2`. Any branch that changes the builder or inference types (3.1–3.3) must restore or rebuild a benchmark as part of the same work. That way each change shows whether a type that is easier to read is also no slower to check. Several of these types are shaped for checker performance rather than readability, so a cleanup that only looks simpler can regress it.

### 3.1 Derive route modes instead of storing `kind` and `input`

`RouteDeclaration` stores `kind`, `input` and `output`, but only `output` carries information that can't be derived:

- **`input`:** flat input is exactly "the route has `request.input`". The builder already keeps them in sync: `input()` sets both, the segment methods set `"segments"`, and `headers()` keeps whichever mode is set.
- **`kind`:** in declarations, it is mostly read to default `input` / `output` when they are `undefined` (`UsesFlatInput`, `UsesPlainOutput`, `initClient.ts`, `handleHttpRoute.ts`). The other reads are:
  - the builder's "method and path already selected" guard (`httpState`, and the `handler()` default in `server/routeBuilder.ts`). This is builder state and doesn't need to live in the declaration.
  - Nest skipping the path comparison for procedures (`nest/routeInterceptor.ts`) and rejecting root procedures (`nest/decorators.ts`). Both really ask whether the path is derived from the tree. Check whether `path === undefined` can answer that, since `.get()` also accepts an undefined path.

The `kind` fallback for `input` only applies to routes without input, where "flat" and "segments" mean the same thing because there is no request state to shape. Today that fallback is applied inconsistently: the `UsesFlatInput` type uses it, but `getHandlerRequestFields` (`server/handleHttpRoute.ts`) doesn't.

**Suggestion:** drop `kind` and `input` from `RouteDeclaration`. Derive flat input from `request.input`, and have the procedure builder set `output: "output"` explicitly. `undefined` output then means `"response"`. This reduces 2.1's mode predicates to one-line checks and removes a type-level conditional from 3.3.
**Value: high, but invasive.** It changes the declaration shape, so it affects generated contracts (`generateContractFromType.ts`) and every reader of `kind` / `input`.

### 3.2 Builder state transitions in `core/src/contract/routeBuilder.types.ts`

Transition types such as `UseMethod`, `WithHttpRoute` and `WithOpenApi` list every `BuilderState` field by hand, so adding a state field means editing each of them. A `Patch<TState, TChanges> = Omit<TState, keyof TChanges> & TChanges` helper, or an explicit mapped equivalent, could remove the repetition.

The `WithX` types deliberately collapse builder state into one object, so TypeScript doesn't recompute the same information at every chained call. A naive version with one generic per option would cause that recomputation. `Omit` + intersection can bring back some of that cost and produce deeper instantiations, so only adopt `Patch` if the benchmark shows no regression.

The five identical `HttpMethods` signatures (`get`, `post`, …) stay as they are. A mapped type would turn them from methods into function-typed properties, which shows up in editor hovers and completions.

**Value: high.** This is the largest file in the repo and the most edited type surface.

### 3.3 Request and response inference types

`core/src/contract/request.ts`:

- `InferSchemaInputs` and `InferSchemaOutputs` are the same recursion with a different combine step (`&` vs `RightMerge`).
- `HasRequestInput` + `InferRequestFor` + `ServerRequest` use a `never`-sentinel pass and then a separate `[X] extends [never]` pass to get "no input".

`core/src/contract/response.ts`:

- `InferClientResponseBody` and `ServerResponseBody` differ only in input vs output and SSE wrapping.
- `DeclaredClientResponse`, `ServerResponse` and `SuccessfulDeclaredClientResponse` repeat the same "map over status keys" shape.
- `ErrorDeclaredClientResponse` `Exclude`s one large union from another, when filtering on non-2xx keys directly would do.
- `ServerProcedureResponse` (core) and `ProcedureHandlerResult` (server) are the same type, except server adds SSE events.

`core/src/client/request.ts`:

- `StandardFetchArgs` computes `ClientRequestForDeclaration<E, GlobalHeaderKeys<...>>` three times.
- `RequiresFetchOptions` duplicates the branches of `FetchOptionsFor`.

**Value: medium.** These types are dense, but users only see their results.

### 3.4 Shared adapter test suite

Keep each adapter's request flow explicit: content-type check → body → `handleHttpRoute` → validation errors → write. Being able to read it top to bottom is worth more than removing the duplication. Catch unintended drift with tests instead.

- **Today:** `tests/httpServer.ts` only starts a test server. Each adapter writes its own cases, and fastify and nest don't use the helper.
- **Proposal:** one shared set of test cases, run against all six adapters through a small per-adapter setup function. Cover:
  - a wrong content type returning 415
  - request and response validation errors, with default and custom handlers
  - streams
  - bodiless responses
  - procedure paths
- **Capability flags:** each adapter's setup declares its intentional differences as flags, for example `supportsRequestBodyLimit: false` or `streamErrorsBeforeHeaders: "framework"`. The flags also serve as internal documentation.

**Intentional differences between adapters** (also explained in code comments):

- **Stream validation errors:** only node and express can turn one into an error response, and only when the first chunk fails, before headers are sent. Fetch and hono commit status and headers when the `Response` is returned. Fastify and nest leave stream errors to the framework.
- **`requestBodyLimit`:** only fetch, node and hono decode request bodies themselves. Express, fastify and nest use the framework's parser, which owns size limits. This is publicly documented in `content/docs/http-behavior/errors.mdx`.

**Value: high.** It guards every adapter against regressions without hiding their code behind shared abstractions.
