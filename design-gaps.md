# Design gaps

## Before stable

- **JSON client bodies typed as `Jsonify<T>`**, only where the body is
  always JSON: responses whose headers schema declares no `content-type`, SSE
  event data, and error `data`. `Date` becomes `string`, `Map` and `Set`
  become an empty-object type (never `{}`), and `undefined` properties become
  optional. For those responses, a schema output with values JSON can't send,
  such as `bigint`, is a type error at `.response()`. A response that declares
  a `content-type` keeps the schema output. Pin with type tests against
  `JSON.parse(JSON.stringify(value))`.
- **Opt-out for `Jsonify`.** A global, type-only switch declared by
  augmenting an interface in `@rest-rpc/core`, for JSON codecs that restore
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

## Docs

- **Rewrite the HTTP behaviour pages.** Cover how content types are chosen,
  what the client receives compared with what the server sends, and the
  pitfalls.
- **Document these trade-offs:**
  - Content types are only inferred for async iterables (SSE), returned
    `Response`s (raw) and `FormData` (multipart).
  - One body schema per status.
  - A response that declares a `content-type` is typed as its schema output
    on the client, so the schema has to match what the codec decodes, such as
    `string` for `text/*` and `Blob` for binary.
  - Interceptors are outside the typed contract. An error they throw isn't
    resolved against the route, so a code the route declares is thrown with
    the route's own error class, or the client trusts a shape nothing
    checked. Undeclared codes are sent as thrown, as anywhere else.
  - `onError` wraps every Fetch response body to report late stream
    failures, at about 1.6 µs per response.
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
- **Document interceptors as the standard pattern they are**, in one place
  per runtime: the order they run in, what runs before and after `next()`,
  what `next()` resolves and rejects with, where the app writes errors, and
  how a `next().catch(errorResponse)` interceptor changes that for the ones
  before it. Point out that frameworks often split the same pattern into
  named hooks that each solve a narrower problem.
  - Lead with one copyable example of the full lifecycle of a request:
    interceptors, the `catch` interceptor, `onError`, the context function,
    middleware and the handler. Each step logs when it runs before and after
    `next()`, so running it shows the order, including for a request that
    fails validation, a handler that throws and a path that matches no route.
    It belongs in the examples package, so it's typechecked and run.
- **Interceptor examples** for CORS, a problem+json error format on the
  server and the client, and serving a path prefix before routing, such as
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
