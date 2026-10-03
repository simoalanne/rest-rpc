# Codebase audit: duplication and complexity

Scope: non-test sources under `packages/*/src`. Dead code found during the audit has already been removed (see the end of this file).

Items are grouped by effort, cheapest first, so small changes can be reviewed and merged before the larger ones. Each cheap item fits in its own small commit. Every item has a value note:

- **High:** removes drift risk across packages, or code that is touched often.
- **Medium:** noticeably shortens or clarifies code that is read regularly.
- **Low:** local tidy-up.

## Tier 1: cheap

Mechanical changes in one file or a few lines, with no behavior change.

### 1.1 Fix broken doc links

`packages/server/src/implement.types.ts:60` and `:66` link to `https://rest-rpc.devdocs/...`, which is missing a `/` and uses an old path.
**Value: medium.** These links appear in editor hovers.

### 1.2 Remove pointless indirection

- `ServerRequestValue` (`core/src/contract/request.ts:203`) is a one-line alias of `ServerRequest`.
- `RouteBuilder.#next` (`core/src/contract/routeBuilder.ts:181`) only forwards to `clone`.

**Value: low.**

### 1.3 Merge duplicate validation wrappers

- Client: `validateResponseBody` (`client/response.ts:197`) and `validateData` (`client/stream.ts:6`) are identical.
- Server: `validateResponseBody` (`server/validation.ts:130`) and `validateResponseStreamChunk` (`:166`) differ only in the `ResponseValidationError` location. One function can take the location as a parameter.

**Value: low.**

### 1.4 Look up response declarations directly

`getResponseSchema` in `core/src/client/response.ts:148` and `server/src/handleHttpRoute.ts:75` scans `Object.entries(...)` for `Number(status) === status`. A direct `route.responses[status]` lookup does the same.
**Value: low.**

### 1.5 Simplify OpenAPI operation helpers in `core/src/openapi/operation.ts`

- `createHeaderParameters` (:160) only forwards to `createParameters`. Inline it.
- `createResponse` (:193) repeats the description and headers spread in three branches. Build the base object once.
- `createResponses` (:292) passes `openApiResponse.description` as the fallback and also passes `openApiResponse`, so the description is resolved twice.

**Value: low.**

### 1.6 Tidy up the TanStack utils in `tanstack-query/src/createUtils.ts`

- "`queryKey ?? (disabled || request === undefined ? routePath : [...routePath, request])`" appears three times. Extract one function for it.
- `streamedQuery` is called in two branches that differ only by `reducer` / `initialValue`.
- `streamedQueryOptions` is declared optional and assigned after the object literal (:121). Define it inside the literal instead.
- `splitFetchOptions` is immediately followed by a second destructure of the same object.

**Value: medium.** This file is short, and these four patterns make up most of it.

### 1.7 Extract small runtime helpers

Each of these is a named call with no branching of its own, so the code that calls it still reads top to bottom.

- **Header stringification:** `flatMap(([k, v]) => v === undefined ? [] : [[k, String(v)]])` appears 4 times:
  - `client/request.ts:227` and `:369` (the same file defines `stringifyHeaders` and then inlines it again)
  - `server/handleHttpRoute.ts:127`
  - `server/validation.ts:161`
- **Content type lists:** the `string | readonly string[]` to `string[]` conversion appears 5 times:
  - `openapi/operation.ts:175` and `:231`
  - `client/response.ts:167`
  - `server/handleHttpRoute.ts:102`
  - `server/requestContentType.ts:19`

  Three of those then compare entries with `normalizeMediaType(a) === normalizeMediaType(b)`. Add `contentTypeList()` and `matchesMediaType()` to `@rest-rpc/core/codecs`.

- **`requestBodyLimit` check:** the option's validation is copied in `fetch/src/handler.ts:81`, `node/src/handler.ts:77` and `hono/src/registerRoutes.ts:81`. It could live next to `deserializeRequestBody` in `@rest-rpc/fetch/adapter`, which node and hono already import.

**Value: medium.** These helpers encode rules (media type matching, header serialization) that should behave the same everywhere.

### 1.8 Share small helper types and guards

Put these in one internal `type-utils.ts` in core. It should not be exported from the package root.

| Helper                                                                                                                                  | Copies                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Merge` / `Simplify`                                                                                                                    | 6: `core/contract/request.ts:31`, `core/contract/response.ts:50`, `core/contract/routeBuilder.types.ts:18`, `core/client/response.ts:24`, `server/implicitResponse.types.ts:6`, `server/routeBuilder.types.ts:119` |
| `EmptyObject`                                                                                                                           | 4                                                                                                                                                                                                                  |
| `MaybePromise`                                                                                                                          | 2                                                                                                                                                                                                                  |
| `ProcedureContentType`                                                                                                                  | 2: `core/contract/response.ts:201`, `server/routeBuilder.types.ts:154`                                                                                                                                             |
| `ProcedureRouteOutput` (`core/client/response.ts:141`) vs `DeclaredRouteResponseBody` (`tanstack-query/createTanstackQueryUtils.ts:39`) | Identical                                                                                                                                                                                                          |
| `RequestTransportFields`                                                                                                                | 2: `server/middleware.types.ts:18`, `server/routeBuilder.types.ts:31`                                                                                                                                              |
| `HttpHeaderValue`                                                                                                                       | 2: `server/headers.ts:1`, `fetch/response.ts:9`                                                                                                                                                                    |
| `isAsyncIterable`                                                                                                                       | 2: `server/implicitResponse.ts:5`, `tanstack-query/createUtils.ts:45`                                                                                                                                              |

**Value: low to medium.** Each change is trivial, and together they remove a lot of copies.

## Tier 2: medium

These changes cross package boundaries or need test updates.

### 2.1 Share response serialization across adapters

Four places resolve a codec with `[...bodyCodecs, ...defaults]`, serialize the body, copy the serializer's headers, copy the result headers, and handle `serialized.contentType` being `undefined`, `null` or a string:

- `fetch/src/response.ts:44`
- `node/src/response.ts:34`
- `fastify/src/registerRoutes.ts:144-175`: a near-verbatim copy of `writeNodeResponse`
- `nest/src/routeInterceptor.ts:157-193`

Fetch throws a clear error when no serializer matches. The other three use `codec!.serialize!`.

**Suggestion:** add `serializeHttpRouteResult(result, codecs, defaultCodecs)` to `@rest-rpc/server`, returning `{ status, headers, contentType, body }`. Writing the result to the native response stays in each adapter.
**Value: high.** This is the largest duplicated runtime block in the adapters.

### 2.2 Share the route mode predicates

"Uses plain output" and "uses flat input" are worked out separately in each layer:

- Runtime:
  - `server/handleHttpRoute.ts:71` (`usesPlainOutput`)
  - `core/client/initClient.ts:115-120` (`flatInput`, `plainOutput`)
  - `tanstack-query/createTanstackQueryUtils.ts:469` (`output === "response"`, a slightly different rule)
  - `server/handleHttpRoute.ts` `getHandlerRequestFields`
- Type level:
  - `UsesPlainOutput` (`server/implicitResponse.types.ts`)
  - `UsesFlatInput` (`core/contract/request.ts`)
  - Ad-hoc `E extends { output: "output" }` checks in `core/contract/response.ts` and `core/client/response.ts`

**Suggestion:** export the `usesPlainOutput` / `usesFlatInput` functions and the matching `UsesPlainOutput` / `UsesFlatInput` types once from `@rest-rpc/core/contract`.
**Value: high.** If these rules diverge, the client and server disagree on the wire format.

### 2.3 Route tree guards and the default procedure path

- Five type guards check for a `"~restrpc"` leaf:
  - `core/contract/traversal.ts:28`
  - `tanstack-query/createTanstackQueryUtils.ts:415`
  - `server/implement.ts:13`
  - `server/match.ts:95`
  - `nest/routeInterceptor.ts:40`
- The `` `/${path.join("/")}` `` procedure-path rule is derived in `traversal.ts:52`, `initClient.ts:113` and `match.ts:120`, plus once more in `generateContractFromType`.

**Suggestion:** add one `isRouteLeaf` guard and one `resolveRoutePath(route, treePath)` to core. Optionally, rebase the server and tanstack tree walkers on `contractRouteEntries` / `mapContractRoutes`.
**Value: high** for the path rule: if it changes in one place, the client calls a different path than the server serves. **Low** for the guards.

### 2.4 Simplify client request execution in `core/src/client/request.ts`

- **Generic that adds nothing:** `executeRequest<E>` (:335) is generic, but takes `route: E | ClientRequestRoute` and `args: FetchArgs<E> | unknown[]` and casts both straight away.
- **Duplicate local types:** `ClientRequestRoute`, `ClientRequestDeclaration` and `GroupedRequestInput` are local copies of `RouteDeclaration` / `RouteRequestDeclaration`.
- **Coupled conditions:** `constructBaseRequest` clears `body` when there is no content type and clears `contentType` when there is no body. Both should collapse into one "has body" decision.

**Value: medium.**

### 2.5 Server result normalization in `server/src/handleHttpRoute.ts`

- The plain-output branch calls `normalizeResponseResult` twice with nearly identical envelopes.
- With `disableResponseValidation`, the header handling repeats the stringification that `validateResponseHeaders` already does.

**Value: medium.** This is the core of every request.

### 2.6 Drop the single-schema branch in OpenAPI generation

`SchemaOrSchemas` / `getSchemas` (`openapi/operation.ts:113`) accept one schema or an array. Route declarations always store arrays, so the single-schema branch is reached only from `operation.test.ts`. Removing it means updating those tests.
**Value: low.**

### 2.7 Accept only the lazy request shape in `fetch/src/deserializeRequestBody.ts:12`

- **Lazy request only:** the source parameter is a union of `Request` and a lazy `{ toFetchRequest, contentType }`, which leads to `isLazyRequest` branching throughout. Always taking the lazy shape (Fetch callers pass `() => request`) removes the branching.
- **Codec lookup:** while here, `resolveBodyCodec` (`core/codecs/operations.ts:11`) nests its `serialize` / `deserialize` search inside one loop with compound conditions. Two `find` calls would be clearer.

**Value: low.**

## Tier 3: large

Type-level or design-level changes, to be reviewed last.

### 3.1 Builder state transitions in `core/src/contract/routeBuilder.types.ts`

Seven transition types each list all 8 `BuilderState` fields by hand: `UseMethod` (:66), `WithRequest`, `WithContentType`, `WithResponse`, `WithFlatInput` (:168), `WithHttpRoute` and `WithOpenApi` (:233). Adding a state field means editing every one of them.

- **Shared patch helper:** use a `Patch<TState, TChanges> = Omit<TState, keyof TChanges> & TChanges` helper, or an explicit mapped equivalent so hover output stays readable.
- **Append logic:** `WithFlatInput` inlines the "append schema to tuple" logic twice. That logic already exists in `WithRequest`.
- **HTTP method signatures:** `HttpMethods` (:547) declares five identical signatures (`get`, `post`, `put`, `patch`, `delete`). A mapped type over `{ get: "GET"; ... }` would replace them.

**Value: high.** This is the largest file in the repo and the most edited type surface. Check hover output and type-test results carefully.

### 3.2 Shared adapter test suite

Keep each adapter's request flow explicit: content-type check → body → `handleHttpRoute` → validation errors → write. Being able to read it top to bottom is worth more than removing the duplication. Catch unintended drift with tests instead.

- **Today:** `tests/httpServer.ts` only starts a test server. Each adapter writes its own cases, and fastify and nest don't use the helper.
- **Proposal:** one shared set of test cases, run against all six adapters through a small per-adapter setup function. Cover:
  - a wrong content type returning 415
  - request and response validation errors, with default and custom handlers
  - streams
  - bodiless responses
  - procedure paths
- **Capability flags:** express, fastify and nest don't decode request bodies themselves, and the adapters handle stream validation errors differently (see below). Each adapter's setup declares these as flags, for example `supportsRequestBodyLimit: false` or `streamErrorsBeforeHeaders: "framework"`. The flags also serve as internal documentation.

**Intentional differences between adapters** (also explained in code comments):

- **Stream validation errors:** only node and express can turn one into an error response, and only when the first chunk fails, before headers are sent. Fetch and hono commit status and headers when the `Response` is returned. Fastify and nest leave stream errors to the framework.
- **`requestBodyLimit`:** only fetch, node and hono decode request bodies themselves. Express, fastify and nest use the framework's parser, which owns size limits. This is publicly documented in `content/docs/http-behavior/errors.mdx`.

**Value: high.** It guards every adapter against regressions without hiding their code behind shared abstractions.

### 3.3 Restructure request and response inference

`core/src/contract/request.ts`:

- **Duplicate recursion:** `InferSchemaInputs` (:35) and `InferSchemaOutputs` (:48) are the same recursion with a different combine step (`&` vs `RightMerge`).
- **Two branches for "no input":** `HasRequestInput` + `InferRequestFor` + `ServerRequest` use a `never`-sentinel pass and then a separate `[X] extends [never]` pass to get "no input".
- **Nested conditionals:** `ClientRequestForDeclaration` re-derives the flat-input source with four levels of nested conditionals. `FlatInputSchemas` derives the same thing.

`core/src/contract/response.ts`:

- `InferClientResponseBody` (:58) and `ServerResponseBody` (:69) differ only in input vs output and SSE wrapping.
- `DeclaredClientResponse`, `ServerResponse` and `SuccessfulDeclaredClientResponse` repeat the same "map over status keys" shape.
- `ErrorDeclaredClientResponse` is computed by `Exclude`-ing one large union from another, when filtering on non-2xx keys directly would do.
- `ServerProcedureResponse` (core) and `ProcedureHandlerResult` (server) are the same type, except server adds SSE events.

`core/src/client/request.ts`:

- `StandardFetchArgs` (:147) computes `ClientRequestForDeclaration<E, GlobalHeaderKeys<...>>` three times.
- `RequiresFetchOptions` duplicates the branches of `FetchOptionsFor`.

**Value: medium.** These types are dense, but users only see their results. Hover output and type tests are the review criteria.

### 3.4 Store flat input as `request.input` (design change)

"Flat input goes to `query` for GET, otherwise to `body`" is encoded in at least 7 places:

- Runtime: `routeBuilder.ts` `httpState` + `input()`, `initClient.ts`, `handleHttpRoute.ts`
- Type level: `ClientRequestForDeclaration`, `FlatInputSchemas`, `WithFlatInput`, `MoveFlatInput`

Storing flat input under a single `request.input` key in the declaration would leave the GET/body split only at the transport edge: client serialization and server request parsing.
**Value: high, but invasive.** It changes the declaration shape, which affects generated contracts.

### 3.5 Replace prototype patching with an explicit builder extension

- **Prototype patching:** `server/src/routeBuilder.ts:8` adds methods to core's `RouteBuilder` prototype through `Object.defineProperties`. This relies on side-effect imports (`import "./routeBuilder.ts"` in `implement.ts`).
- **Explicit alternative:** a subclass, or a `RouteBuilder` constructor hook, would make the extension point visible.
- **Repeated method bodies:** while here, `body`, `query` and `params` in `RouteBuilder` share an almost identical body.

**Value: medium.**

### 3.6 Route tree mapping type

`T extends { "~restrpc": infer R } ? X<R> : { [K in keyof T]: Recurse<T[K]> }` is repeated about 11 times:

- `InferClientRequest`, `InferClientResponse`, `InferClientSuccess`, `InferClientError`, `InferClientStreamData`
- `InferServerRequest`, `InferServerResponse`
- `RouteHandlerFor`, `ApiClientFor`
- tanstack `InferClientError`, `TanstackQueryUtilsFor`

TypeScript has no higher-kinded types. The `this`-typed interface trick already used by `BuilderExtension` could still express a single `MapRouteTree<T, F>`.
**Value: low** for now. Only worth doing if more of these helpers get added.

### 3.7 Adapter `index.ts` boilerplate

All six adapter entry points repeat `DefaultContext`, `InferServerHandler`, `route`, `implement` and an identical re-export block. A shared generic `AdapterApi<TFields, TContext>` type would cut the cast noise in `route` and `implement`. The per-package `DefaultContext` interface and the TSDoc on each export have to stay.
**Value: low.**

## Separate decision: casing of public names

`Contractimplementer` (a public type), `createimplementer`, `implementerRootMethods` and `streamedQueryOptionsResultFor` have inconsistent casing. Fixing it is cheap, but renaming `Contractimplementer` breaks its public name, so it should be done and released on its own.

## Dead code already removed

- **Unused types and constants:**
  - `RequestSegment`
  - `HasSuccessfulResponse`, `HasMultipleSuccessfulResponses` and their only dependency `IsUnion`
  - `FORM_URLENCODED_CONTENT_TYPE`, `MULTIPART_FORM_DATA_CONTENT_TYPE`
- **Unused traversal helpers:** `flattenContractRoutes` and `contractRoutes`. They were only re-exported from the `@rest-rpc/core/contract` subpath and had no consumers.
- **Unused client parameter:** the `routePath` parameter threaded through `fetchResponse`, `fetchSuccess` and `RouteRequestFn`. The only receiver ignored it (`_routePath`).
- **Unused type parameter:** `RootRouteBuilder`'s `TOptions`. It was always `undefined`, so the type resolved to `never` for anything else.
- **`export` keyword dropped from symbols only used inside their own file:**
  - `mapObjectValues`, `isContractRouteDeclaration`
  - `JSON_CONTENT_TYPE`, `SSE_CONTENT_TYPE`
  - `OpenApiSchema`, `OpenApiRequestBody`, `OpenApiResponse`, `OpenApiExternalDocs`, `OpenApiPathItem`, `OpenApiResponseHeader`
  - `createHeaderParameters`, `createResponseHeaders`, `createOpenApiResponseHeaders`, `createResponses`
  - `compareRouteSpecificity`, `CompletedRoute`, `validateResponseStreamChunk`, `TanstackQueryUtilFunctions`

**Not removed:** several type-only re-exports from `@rest-rpc/core/contract` (e.g. `RouteResponses`, `ServerRequest`, `ResponseHeaders`) have no consumers outside core. They were kept because downstream declaration emit may need them to name inferred types.
