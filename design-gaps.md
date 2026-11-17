# Design gaps

## Before stable

- **Route errors reject `next()`.** Interceptors receive every `RouteError`
  thrown, `cause` included, after it's resolved against the route, so its
  status and `data` are the ones sent. The app sends an error no interceptor
  catches. Update the CORS example and the `next()` table in the server docs.
  - Decide how a stream that fails after `next()` resolves is reported on
    Fetch. Node already rejects `next()`.
  - Decide how framework integration observes errors, since route handlers
    write error responses themselves.
- **JSON client bodies typed as `Jsonify<T>`.** `Date` becomes `string`,
  `Map` and `Set` become an empty-object type (never `{}`), and `undefined`
  properties become optional. Values that can't be sent as JSON, such as
  `bigint`, are a type error per `respond()` call. Pin with type tests against
  `JSON.parse(JSON.stringify(value))`.
- **Client body types from the `content-type` header.** `text/*` is `string`,
  forms are objects, SSE is a stream of `Jsonify<item>`, and anything else,
  or a `string` header, is `Blob`. Under a JSON header, apply `Jsonify` only to
  body members that can be sent as JSON.
- **Opt-out for both client body types.** A global, type-only switch declared
  by augmenting an interface in `@rest-rpc/core`, for codecs that restore
  native types.
- **Raw stream chunks.** An async iterable with a non-SSE `content-type` is
  restricted to `AsyncIterable<string | Uint8Array> | ReadableStream<Uint8Array>`.
- **Form bodies as flat objects**, following the query rules:
  - One parser for query strings, urlencoded and multipart bodies, building
    null-prototype objects. `key[]` collects arrays, a repeated key keeps the
    last value, and `a[b]` is a plain key.
  - Request schema input of `string | File` values and arrays of them. Client
    input of scalars and `Blob`s, encoded the way the query is.
  - The form codecs convert in both directions, so multipart responses are
    objects too. A `FormData` instance is sent as it is.
  - A `FormData` body makes the call's `content-type` header optional.
  - The urlencoded serializer throws a `TypeError` for a `Blob` value.
- **Null-prototype objects in `parseQuery`**, with a test for
  `__proto__[]=x`. This can land before the form work.

## Additive

- **A repeated response status is a type error.** Today `.response()` for a
  status the route already defines only throws when the route is defined.
- **Routes at the matched path for interceptors**, for any method, so
  preflights can list the allowed methods and a wrong method can be answered
  with `405`.
- **OpenAPI `requestBody.required`**, set unless the body schema accepts
  `undefined`.

## Docs

- **Fix the stale content type docs:**
  - "Disabling Server Validation" in `schemas.mdx` says content-type checks
    and content-type selection still run. Without request validation, a route
    with a body accepts every request content type. Without response
    validation, a headers schema default such as
    `z.literal("text/csv").default("text/csv")` isn't applied, so the body is
    sent as JSON unless the handler writes the `content-type` header.
  - The `UnsupportedMediaType` TSDoc still mentions routes that define several
    media types. It's sent when the request content type of a route with a
    body isn't one its headers schema declares, or isn't JSON when it declares
    none.
- **Rewrite the HTTP behaviour pages.** Cover how content types are chosen,
  what the client receives compared with what the server sends, and the
  pitfalls.
- **Document these trade-offs:**
  - Content types are only inferred for async iterables (SSE), returned
    `Response`s (raw) and `FormData` (multipart).
  - One body schema per status.
  - Interceptors are outside the typed contract.
  - Request bodies are read whole before they're decoded.
  - Arrays only come from `key[]` keys, so HTML forms use `name="tags[]"`.
  - An empty file input is sent as an empty `File`.
  - Request validation runs before middleware.
- **Security boundaries page:**
  - Left to the host or proxy: body size limits (Node `createApp` has
    nothing in front of it), rate limiting, timeouts and TLS.
  - Left to the app: authentication, CORS, `Set-Cookie` attributes, CSRF,
    and not deep-merging request bodies that a non-stripping schema or
    disabled validation let through.
  - What rest-rpc guarantees: request validation issues are sent to the
    caller, response validation failures are hidden as `500`s, and `cause`s
    are never sent.
- **Interceptor examples** for a problem+json error format on the server and
  the client, and for serving a path prefix before routing, such as
  `/files/*`.
- **Replace the README cheatsheet with runnable examples:**
  - A private examples package of self-contained files, each one task, about
    15 to 40 lines. `check` typechecks them and a test runs them, with the
    client served by `fetch: app.fetch`.
  - One example for the basics, and the rest for what can't be guessed by
    copying existing routes: content types as headers, interceptors, defined
    and undefined errors, SSE, raw `Response`s, `.static()`, context and
    middleware, framework mounting, the client options and interceptors,
    TanStack Query and contract-first.
  - One way per task, with comments only where an agent would otherwise
    change the code.
  - Generate the docs cheatsheet page and a `CHEATSHEET.md` in each published
    package from the files.
  - A short hand-written README: an introduction, installation, one example
    and links. Package READMEs copy it.
  - Narrow the skill to setting rest-rpc up or using a feature the project
    doesn't use yet. It points to the installed `CHEATSHEET.md` and the
    `.d.ts` TSDoc, and prefers the project's existing patterns.
  - Update `AGENTS.md` and the sync script to match.
- **Lead with what the library guarantees, not with ergonomics.** The README
  introduction and the docs landing page lead with "RPC-like ergonomics"
  today. State instead, in plain terms:
  - Type safety from the handler to the client call is the main point. A
    mismatch, such as a renamed field, a changed status, a removed route or a
    missing content type, fails to compile in every place that depends on it,
    so a change or refactor is checked before anything runs.
  - Routes are plain HTTP with no framework abstraction to work around:
    requests, responses, headers and codecs. There's one documented way to do
    each task, and nothing forces an app into a structure beyond it.
  - Testing needs no server: a client served by `fetch: app.fetch`, or the
    local client.

  Describe these as properties of the code, whoever writes it, rather than
  as claims about AI. The honest client body types come first, so that "fails
  to compile" holds for what the client receives.

- **One example theme for the docs, examples and tests**, replacing todos with
  a domain with a natural use for each REST capability the examples show.
