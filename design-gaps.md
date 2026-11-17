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

- **Document that an empty file input is sent as an empty `File`**, with
  the form bodies item.
- **Replace the README cheatsheet with runnable examples:**
  - Move the interceptor lifecycle example from the interceptors page into
    the examples package, so it's typechecked and run.
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
