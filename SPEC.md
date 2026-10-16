# SPEC: Server scope reduction (temporary)

Working spec for narrowing the server side of rest-rpc. Delete once implemented
and the docs reflect it.

## Purpose

rest-rpc is a small type-safety layer for HTTP APIs. It types and validates what
crosses the wire and what reaches handlers, and plugs into any stack or a bare
Node / Fetch runtime with a little glue. It is not a framework: if an app needs
one, bring it; if it only needs type safety, it should not have to adopt one.

Adoption should work as a ladder where each step stands without the next:

1. Shared route declarations and inferred types only.
2. Runtime validation.
3. Contract extraction and the typed client.
4. Registration helpers, only when wanted.

## Scope test

A feature belongs if it is part of the type-safety surface (wire shape,
validation, typed handler inputs and outputs, typed context, typed client), is
framework-independent, is small, and is useful when the host provides nothing.
It must be bypassable where a host already provides the same thing.

Everything outside that surface stays the host's job: routing features,
plugins, lifecycle hooks, DI.

| Feature                                             | Status                                             |
| --------------------------------------------------- | -------------------------------------------------- |
| Route builder, schemas, request/response validation | Keep                                               |
| Implicit responses                                  | Keep                                               |
| Contract extraction, client, OpenAPI                | Keep                                               |
| Typed error responses                               | Keep                                               |
| Middleware + typed context                          | Keep                                               |
| Codecs / serialization                              | Keep, owned by rest-rpc                            |
| Streaming / SSE                                     | Keep, written by rest-rpc on both runtimes         |
| Contract-first                                      | Keep, low priority                                 |
| TanStack Query                                      | Keep, separate package                             |
| Express / Hono / Fastify / Nest adapters            | Remove, Express / Hono / Fastify get docs snippets |

## Package layout

```
@rest-rpc/core            contract, client, codecs, openapi (unchanged)
@rest-rpc/server          route builder, implement, middleware, context,
                          validation, codecs wiring, sse, errors, dispatch core
@rest-rpc/server/fetch    route, implement, compileRoutes, createCatchAllHandler (Fetch)
@rest-rpc/server/node     route, implement, compileRoutes, createCatchAllHandler (Node)
@rest-rpc/tanstack-query  unchanged
```

`@rest-rpc/fetch` and `@rest-rpc/node` move into the server subpaths. Separate
Fetch and Node variants are kept on purpose: exact native types, Node streaming
with backpressure and abort handling, and no `Response` conversion overhead on
Node. A single variant accepting `Request | IncomingMessage` was considered and
rejected.

Internal-ish helpers (e.g. `writeNodeResponse`, body deserialization) live on a
non-root subpath like the current `@rest-rpc/fetch/adapter`. Per AGENTS.md they
are not public API.

Public API rules from AGENTS.md apply to the root and runtime subpaths:
explicit exports, TSDoc on declarations, `function` declarations for exported
functions.

## Routing

rest-rpc has no routing opinions of its own. The custom matcher
(`createPathMatcher`, `compareRouteSpecificity`, linear scan in
`createRouteMatcher`) is replaced by [rou3](https://github.com/h3js/rou3) as the
single accepted routing dependency. Whatever rou3 does (precedence, trailing
slashes, param decoding) is the behavior; the current matcher's behavior is not
a documented invariant and is not preserved.

rou3 is used:

- by `createCatchAllHandler` to match method and path;
- by `compileRoutes` handlers to read params from the URL, so params mean the
  same thing on both paths.

### Path syntax

Officially supported param markers are `:name` and `{name}`, the two the
client and OpenAPI already understand. Other syntax (wildcards, regex) is not
rejected but is not documented as working.

Paths are not rewritten on the way out. Entry `path` is the declared path with
`prefix` applied, in whatever marker it was written. Conversion happens only:

- internally, if rou3 needs a specific marker;
- on request, via a `paramSyntax` option (`"colon"` → `:id`, `"braces"` →
  `{id}`), so entries can be registered on an existing router that expects one
  of the two.

## API

One function compiles the route tree into a flat list of routes. That list is
then either looped and registered on an existing router, or passed to the
built-in catch-all handler. Both subpaths export the same two functions:

```ts
const routes = compileRoutes(tree, { prefix: "/api" });

// Either: register on your own router
for (const route of routes)
	router.on(route.method, route.path, (req) => route.handle(req));

// Or: use the built-in catch-all
const handler = createCatchAllHandler(routes);
```

- `compileRoutes(tree, options)` takes all the options (codecs, body limit,
  prefix, param syntax, error handlers, validation toggles), applied once.
- `createCatchAllHandler(routes)` takes no options. It only builds a rou3
  router over the given routes, so its behavior is obvious: match, then call
  the route's `handle`.

Because the catch-all takes a plain list, routes can be filtered or combined
before passing them in, including lists compiled with different options:
`createCatchAllHandler([...compileRoutes(api, { prefix: "/api" }), ...compileRoutes(admin, { prefix: "/admin" })])`.

### `createCatchAllHandler(routes)`

```ts
// Fetch
function createCatchAllHandler(
	routes: readonly FetchRoute[],
): (
	request: Request,
	options?: HandleOptions,
) => Promise<
	| { matched: true; response: Response }
	| { matched: false; response: undefined }
>;

// Node: always writes the result, including streams, to `res`
function createCatchAllHandler(
	routes: readonly NodeRoute[],
): (
	req: IncomingMessage,
	res: ServerResponse,
	options?: HandleOptions,
) => Promise<{ matched: boolean }>;
```

The catch-all converts paths to rou3's marker internally, so it works
regardless of the `paramSyntax` the routes were compiled with.

### `compileRoutes(tree, options)`

Returns one route per method + path. A single implemented route is a valid
tree, so `compileRoutes(getTodo)[0].handle` covers the single-route case
without a separate helper.

A compiled route is a registration record, not a second view of the
declaration:

```ts
// Fetch
type FetchRoute = {
	readonly method: HttpMethod;
	/** Resolved path: tree-key fallback, prefix and `paramSyntax` applied. */
	readonly path: string;
	/** Handles an already-routed request. Params are read from the request URL. */
	readonly handle: (
		request: Request,
		options?: HandleOptions,
	) => Promise<Response>;
};

// Node: writes the result, including streams, to `res`
type NodeRoute = {
	readonly method: HttpMethod;
	readonly path: string;
	readonly handle: (
		req: IncomingMessage,
		res: ServerResponse,
		options?: HandleOptions,
	) => Promise<void>;
};
```

`method` and `path` are the values to register, not copies of the
declaration: a declared `path` may be `undefined` (derived from tree keys),
and the compiled one has `prefix` and `paramSyntax` applied.

The declaration is not exposed. Exposing it would put the user's raw
`handler` (stored on the declaration at runtime) next to `handle`, two
callables for the same route with different contracts. Route metadata access
for host-side middleware is a follow-up if needed.

`handle` is a property holding a function, not a method, so it can be passed
around. It should still be wrapped rather than passed to a router directly:
routers pass extra arguments (Bun passes `server` second, find-my-way passes
`params` third) that would land in the `options` position.

### `HandleOptions`

```ts
type HandleOptions = {
	/** Seeds the per-request context before middleware runs. */
	context?: Partial<DefaultContext>;
};
```

`context` is the only per-call option. It is how host-provided data (auth,
session, tenant, or the raw request if a handler really needs it) reaches
middleware and handlers. Typed by the existing `DefaultContext` augmentation;
`createContext` accepts initial values.

### Params

Entries never take params from the caller. They are read from the request URL
against the entry's path via rou3. If the URL does not match the entry's path,
the entry throws an error naming the route and the received path; this only
happens with wrong wiring (e.g. a mount prefix not reflected in `prefix`).

### Handler fields

Native request and response objects are no longer handler fields on either
runtime: Fetch `request`, Node `req` and `res` are removed. Handlers and
middleware receive the parsed request segments, `context` and `signal`.
Anything native goes through `HandleOptions.context`.

`signal` is always provided and its creation is unchanged (Fetch:
`request.signal`, Node: `createRequestSignal(res)`).

This removes `DefaultRequest` augmentation and the per-runtime
`TAdditionalHandlerFields` in `createAdapterApi`, so `route` / `implement` can
be identical across runtimes.

## Serialization

rest-rpc owns serialization in both directions. There is no "pass a pre-parsed
body" option. Hosts that parse bodies (`express.json()`, Fastify content
parsers) must skip that on rest-rpc routes; documented per host.

`BodyCodec<TSource>` loses its native-request generic: codecs always
deserialize from a Fetch `Request` (Node converts lazily via `toFetchRequest`,
only when a codec needs it).

## Errors

Unchanged in the initial version: rejections and validation errors are written
by `handle` as today, and `requestValidationErrorHandler` /
`responseValidationErrorHandler` keep their current per-runtime signatures.

## Framework integration (docs only)

Express, Hono and Fastify get a short docs snippet looping `compileRoutes`.
Other frameworks, Nest included, follow the same pattern; no package.

```ts
const routes = compileRoutes(tree, { prefix: "/api" });

// Bun native router
const bunRoutes = {};
for (const r of routes)
	(bunRoutes[r.path] ??= {})[r.method] = (req) => r.handle(req);
Bun.serve({ routes: bunRoutes });

// Hono
for (const r of routes)
	app.on(r.method, r.path, (c) =>
		r.handle(c.req.raw, { context: { user: c.var.user } }),
	);

// Fastify: leave the body stream unread and let rest-rpc write reply.raw
// (unverified)
fastify.removeAllContentTypeParsers();
fastify.addContentTypeParser("*", (_req, _payload, done) => done(null));
for (const r of routes)
	fastify.route({
		method: r.method,
		url: r.path,
		handler: async (req, reply) => {
			reply.hijack();
			await r.handle(req.raw, reply.raw);
		},
	});
```

## Implementation order

1. Replace the internal matcher with rou3 behind `createRouteMatcher`; update
   `match.test.ts` to rou3 semantics rather than preserving current ones.
2. Extract a shared dispatch core from the Fetch and Node `createRouteHandler`
   closures.
3. Add `compileRoutes` (routes with `handle`, URL-based params via rou3,
   `paramSyntax`, `HandleOptions.context`); replace `createRouteHandler` with
   `createCatchAllHandler(routes)` built on rou3.
4. Remove native handler fields.
5. Drop the `TSource` generic from `BodyCodec`.
6. Move `fetch` and `node` into `@rest-rpc/server/fetch` and `/node`.
7. Remove Express, Hono, Fastify and Nest packages; add docs snippets.
8. Update `content/docs/` to the adoption ladder and new server pages.

## Follow-ups (not in the initial version)

- **`dispatch` escape hatch.** Per-route `dispatch(request, options)` returning
  `SerializedHttpRouteResult` without writing, on both runtimes, for hosts that
  need more control. The caller owns writing, streaming and mid-stream errors.
  Requires:
  - all rejections (content type, body, request/response validation) to become
    serialized results instead of being written;
  - error handlers returning a response envelope (`{ status, body, headers? }`)
    instead of a `Response` (Fetch) or writing to `res` (Node);
  - a documented type for `SerializedHttpRouteResult["body"]["value"]` after
    codecs (string, `Uint8Array`, stream) on both runtimes;
  - Node `signal` derived from the request/socket instead of `res`.
- **Route metadata on compiled routes** (e.g. `metadata` / `openApi`), for
  host-side middleware or logging that needs to know which route matched.
  Not the full declaration.
- **Path syntax beyond `:name` / `{name}`.** Wildcards and regex reach the
  router fine but break client URL building and OpenAPI. Decide whether to
  support them and how the client and OpenAPI handle them.
