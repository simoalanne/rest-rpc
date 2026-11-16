# Design gaps

Open design questions and follow-ups. An item is removed once it's decided and
done, so the document is empty when nothing is left.

- Cases 1, 2 and 4 are client body types and stream chunks, which change
  existing types. Form bodies as objects changes how forms decode.
- Case 6, the error format, needs a new feature, but covers a gap with no
  realistic escape hatch.
- Case 13 is interceptors on the server and the client: one primitive that
  replaces users' own wrappers, CORS included.
- Case 14 is wildcard path params, which may not be worth doing.
- [Docs to write](#docs-to-write) lists decisions the docs still have to
  explain.

Each case shows realistic code as it works today, the best escape hatch
available, and a sketch of a fix. The sketches are directions, not final API.

## Path to stable

The API can be considered stable once everything left only adds to it.

### Before stable: changing these later would break users

| Case                              | Why it can't wait                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 and 2: honest client body types | `Jsonify<T>` and `Blob` for binary narrow existing client types. Ship them with the opt-out, so apps whose codecs restore native types keep their types. |
| 4: stream chunk types in handlers | Restricting the handler's return type to `string \| Uint8Array` chunks is a breaking type change.                                                        |
| Form bodies as objects            | Form bodies decode to objects instead of `URLSearchParams` and `FormData`.                                                                               |

### After stable: additive

- Loosening how strictly the client states content types, which only relaxes
  types: a `FormData` body could make the call's `content-type` header
  optional, since it's sent as multipart anyway, and a `content-type` in
  `globalHeaders` or `additionalHeaders` could select the codec too. Decide
  together with sending typed objects as multipart.
- 6: the error format option.
- 13: the interceptors.
- 14: wildcard path params.

## Form bodies as objects

Today `application/x-www-form-urlencoded` decodes to `URLSearchParams` and
`multipart/form-data` to `FormData`. Both are values that schemas can't
describe, so a handler reads fields by name, and a typo or a renamed field only
shows up at runtime:

```ts
.handler(({ body }) => save(body.get("title"), body.get("filr"))); // compiles
```

A `URLSearchParams` body is also something no app builds from its own state.
The content type still arrives from senders the app doesn't control: native
`<form method="post">` without `enctype`, webhooks such as Slack's and
Twilio's, and OAuth token requests.

Instead, both form types decode to a plain object with the same rules as the
query string:

- `key=value`, with `key[]` for arrays;
- no nested objects;
- strings, coerced by the schema (`z.coerce.number()`);
- in multipart, `File` values for file fields.

Query strings, urlencoded bodies and multipart bodies then follow one rule, and
the schema describes the form:

```ts
route
	.post("/todos/:id/attachments")
	.headers(z.object({ "content-type": z.literal("multipart/form-data") }))
	.body(
		z.object({
			title: z.string(),
			tags: z.array(z.string()).optional(), // sent as tags[]
			file: z.instanceof(File),
		}),
	)
	.handler(({ body }) => save(body.title, body.file));
```

The client sends a form in either of two ways, and both are first-class:

```ts
// A typed object: the codec builds the FormData, and fetch adds the boundary.
await client.todos.attach({
	params: { id },
	headers: { "content-type": "multipart/form-data" },
	body: { title: "Spec", tags: ["docs"], file },
});

// The FormData a form already gives you, sent as it is.
<form
	onSubmit={async (event) => {
		event.preventDefault();
		await client.todos.attach({
			params: { id },
			body: new FormData(event.currentTarget),
		});
	}}
/>;
```

- **A typed object** follows the content-type rule: without a multipart header
  it's sent as JSON. Nothing is inferred from the value. The header comes from
  the route's typed `headers`. The client types don't check that the header
  and the body fit together. Forgetting the header fails loudly on the first
  call, because the server answers `415` to a JSON body on a route that only
  declares multipart. A check would need request body types that depend on the
  header.
- **A `FormData` instance** is what a React form gives you. Converting it to an
  object and casting, or building it back from a loosely typed object, would be
  busywork that loses as much type safety as it pretends to add. So a
  `FormData` body is always sent as it is, as multipart. It isn't type-checked on the client, but the server
  decodes it to the same object and validates it, so a mismatch is still caught,
  as a `400`.
- **`URLSearchParams`** stops being a value type. It's only the urlencoded side
  of the same rules, and the client sends an object with the urlencoded header.

Decided details for the implementation:

1. **Arrays use `[]` keys.** Query strings and both form types read arrays
   only from `key[]` keys, the convention OpenAPI describes with `style: form`
   and `explode: true`. `<select multiple name="tags">` sends `tags=a&tags=b`,
   and only the last value is kept, so HTML forms use `name="tags[]"`. Without
   the suffix, `tags=a` could be a string or an array, and the server can't tell
   which from the schema. It's one documented caveat for all three places.
2. **Multipart responses.** The conversion lives in the form codecs:
   `deserialize` turns the decoded form into an object, and `serialize` builds
   one from an object, passing a `FormData` instance through unchanged. The
   client and the server share the codecs, so request bodies on the server and
   response bodies on the client are objects alike, with nothing to decide
   separately.
3. **Runtimes.** Both already decode multipart to `FormData` with `File`
   fields through the same codec, so converting it to an object is a plain
   function on top, the same on every runtime.

## 1. Native values in JSON responses

The most common case. Any `Date` in a JSON response is typed as a `Date` on the
client but arrives as a string.

```ts
const getTodo = route
	.get("/todos/:id")
	.handler(({ params }) => db.todos.find(params.id));
// returns { id: string; title: string; createdAt: Date }

const { body } = await client.todos.get({ params: { id } });
body.createdAt; // typed: Date. received: "2026-11-15T10:00:00.000Z"
body.createdAt.getTime(); // compiles, throws TypeError at runtime
```

Declaring the response doesn't help:

```ts
route
	.get("/todos/:id")
	.response(
		z.object({ id: z.string(), title: z.string(), createdAt: z.date() }),
	)
	.handler(({ params }) => db.todos.find(params.id));
// client body: { id: string; title: string; createdAt: Date }
// with validateResponses and a shared contract, z.date() rejects the string
```

The same applies to `Map` and `Set` (sent as `{}`), `undefined` properties
(dropped), and `bigint` (`JSON.stringify` throws).

### Escape hatch

On declared routes, a response schema can transform the value. The handler
returns the schema input, and the client is typed with the schema output:

```ts
route
	.get("/todos/:id")
	.response(
		z.object({
			id: z.string(),
			title: z.string(),
			createdAt: z.date().transform((date) => date.toISOString()),
		}),
	)
	.handler(({ params }) => db.todos.find(params.id)); // client: createdAt: string
```

On inferred routes, the handler has to convert each field by hand. In both
cases it's per field and easy to forget, and nothing warns when you do.

### Fix sketch

Type JSON response bodies on the client as `Jsonify<T>`: what
`JSON.parse(JSON.stringify(value))` actually produces.

- `Date` becomes `string` through `toJSON`.
- `Map` and `Set` become an empty object.
- `undefined` properties become optional or are dropped.

Optionally, make values that can't survive JSON at all, such as `bigint`, a type
error in the handler's return type for JSON responses. Then the server catches
the mistake instead of the client. The check runs per `respond()` call, where
the value and the header are known together, and it also rejects binary values
sent without a header. `Map` and `Set` become an empty-object type, never `{}`,
so they don't swallow a union. Pin these types with type tests against
`JSON.parse(JSON.stringify(value))`.

Apps whose codecs restore native types can opt out globally; see
[Opting out of the client body types](#opting-out-of-the-client-body-types)
under case 2.

For declared schemas, document that client-side validation runs against the
JSON value. Alternatively, `validateResponses` could be limited to schemas
whose input is JSON-compatible.

## 2. Binary response bodies

The server can send a `Uint8Array`, a `ReadableStream` or an async iterable, but
the client always receives a `Blob`. The client type follows the server's type
instead.

```ts
const download = route
	.get("/files/:id")
	.response(z.instanceof(Uint8Array), {
		headers: z.object({
			"content-type": z
				.literal("application/octet-stream")
				.default("application/octet-stream"),
		}),
	})
	.handler(({ params }) => storage.read(params.id)); // Uint8Array

const { body } = await client.files.download({ params: { id } });
body; // typed: Uint8Array. received: Blob
body.byteLength; // compiles, undefined at runtime
```

Inferred routes have the same problem:

```ts
route.get("/files/:id").handler(({ params, respond }) =>
	respond(storage.read(params.id), {
		headers: { "content-type": "application/octet-stream" },
	}),
); // client body: Uint8Array<ArrayBuffer>
```

### Escape hatch

There are two options, each with a cost:

- **Send a `Blob` on the server:** declare `z.instanceof(Blob)` and return
  `new Blob([bytes])`. The types are honest, but the server gives up its natural
  type to match what the client receives.
- **Use a custom codec that decodes to `Uint8Array`:** for example the
  `bodyCodec("application/octet-stream", …)` in the README. It has to be passed
  to both the client and the server, and it changes every octet-stream route,
  not just this one.

### Fix sketch

Derive the client body type from what the `content-type` header decodes to, not
from what the server sends. The header's type is the literal in a `respond()`
call, or the output of a declared headers schema:

| Content type                        | Client body type                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `application/json`, `+json`         | `Jsonify<T>` (see case 1)                                                           |
| `text/*`                            | `string`                                                                            |
| `application/x-www-form-urlencoded` | an object, as forms are decoded ([form bodies as objects](#form-bodies-as-objects)) |
| `multipart/form-data`               | the same                                                                            |
| `text/event-stream`                 | stream of `Jsonify<item>`                                                           |
| anything else, or a `string` header | `Blob`                                                                              |

A declared schema for a binary type then describes only the server side. A
custom codec could declare the type it decodes to, so the client type follows
the codec instead of the table.

A body union under one header, such as a route that sends JSON or CSV from one
status, needs rules to stay honest, because `Jsonify<Blob>` would be an empty object that
almost anything is assignable to:

- **`respond()` call sites are paired.** In `respond(value, { headers })`, both
  types are known together. The JSON-safe check runs per call, and on inferred
  routes, where the handler's return type is a union of paired `respond()`
  results, the client type can be exact.
- **Declared unions are decoded per codec.** Under a JSON header, `Jsonify`
  applies only to body members that can be sent as JSON, without `Blob`,
  `Uint8Array` or streams. The per-call check means those can't reach the JSON
  codec anyway. `text/*` decodes to `string`, and anything else to `Blob`,
  whatever the body is.

### Opting out of the client body types

The derived types in cases 1 and 2 assume the default codecs and no client-side
transformation. Some apps deliberately make the server types true on the
client:

- a custom JSON codec that restores `Date` and `Map`, such as superjson on both
  ends;
- a binary codec that decodes to `Uint8Array`;
- `validateResponses` with schemas that transform the received values back.

For those, a type-only opt-out could be declared by augmenting an interface, the
same approach as `DefaultContext` and `DefaultMeta`. Client types live in
`@rest-rpc/core`, so it's declared there:

```ts
declare module "@rest-rpc/core" {
	interface ClientTypeOptions {
		jsonBodies: "server"; // client JSON bodies typed as the server's types, not Jsonify<T>
		binaryBodies: "server"; // binary bodies typed as the server's types, not Blob
	}
}
```

Or as plain booleans, such as `jsonify: false` and `binaryAsBlob: false`. Either
way, it's a switch, not a place to write a type mapping:

- It's global. An app either uses such codecs or validation everywhere or not
  at all, so per-route control isn't needed.
- It changes types only. Runtime behaviour still comes from the codecs, and the
  switch is the user's statement that their codecs make the server types hold.
- Without the augmentation, the honest derived types apply.

The names are placeholders.

## 4. Raw stream chunks

A handler can stream any values under a non-SSE content type. Only strings and
bytes can actually be sent, but nothing checks that until the response is
already being sent.

```ts
const exportNdjson = route.get("/todos/export.ndjson").handler(({ respond }) =>
	respond(
		(async function* () {
			for await (const todo of db.todos.stream()) yield todo; // objects
		})(),
		{ headers: { "content-type": "application/x-ndjson" } },
	),
);
// compiles. client body: AsyncGenerator<Todo>
```

At runtime the server sends `200` and the headers, then fails on the first
chunk:

- On Node, the write fails with `ERR_INVALID_ARG_TYPE`.
- On Fetch runtimes, a `TypeError` is thrown when the stream is read.

Either way, the connection is cut. Even when it works, the client type is wrong:
`application/x-ndjson` is decoded by the binary codec, so the client receives a
`Blob`, not an async generator.

### Escape hatch

Encode the chunks yourself:

```ts
yield`${JSON.stringify(todo)}\n`;
```

That works on the wire, but the client type is still wrong: an
`AsyncGenerator<string>`, while the client receives a `Blob`.

### Fix sketch

- **Handler types:** an async iterable without a header is SSE. One with any
  other `content-type` header is sent as raw chunks, so restrict it to what can
  be sent: `AsyncIterable<string | Uint8Array> | ReadableStream<Uint8Array>`.
  This is the same rule `BodyValue` now applies to codecs, so the type error
  appears in the handler instead of a cut connection.
- **Client type:** follows case 2, so it's a `Blob`. It could become a
  `ReadableStream<Uint8Array>` if the client gets a streaming body mode later.

## 6. Error response format

Every error rest-rpc sends is `application/json` with
`{ code, message, data? }`. Nothing can change that format: not a codec, not
`onError` (which only observes), and not route options. A route can't send RFC
9457 `application/problem+json`, and it can't send a plain-text error either.

```ts
const getTodo = route
	.get("/todos/:id")
	.error("TODO_NOT_FOUND", { status: 404, data: z.object({ id: z.string() }) })
	.handler(({ params, errors }) => {
		const todo = db.todos.find(params.id);
		if (!todo) throw errors.TODO_NOT_FOUND({ data: { id: params.id } });
		return todo;
	});
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{ "code": "TODO_NOT_FOUND", "message": "TODO_NOT_FOUND", "data": { "id": "42" } }
```

This is the only format on offer, even when the API has to follow a published
error format.

On the client, an error response without a string `code` in its body rejects
with a plain `Error("Request failed with status 404.")`. That's how a
problem+json or plain-text error from a proxy or another server arrives. This
behaviour is reasonable on its own: an unknown error format isn't mistaken for a
typed error. One edge exists, though. A problem+json body with a `code`
extension member would be read as a `RouteError`, because `+json` is decoded as
JSON and the client only looks for `code`.

### Escape hatch

None that's realistic:

- **Rewrite the responses:** wrap `createApp`'s `fetch` (or the Node handler) to
  parse every JSON error response and rewrite it. On Node, that means
  intercepting `ServerResponse` writes. It works, but every response pays for
  it.
- **The cost on the client:** a rewritten error no longer has `code` in the
  shape the client expects, so typed errors become plain `Error`s. You'd have to
  rewrite responses back on the client too, with a custom `fetch`.
- **Use framework integration instead of `createApp`:** this doesn't help.
  Route handlers write `RouteError`s themselves, and only other errors reach the
  framework.

`createApp`'s `notFound` can already send its own response. That's the only
error response whose format can be chosen today.

### Fix sketch

A two-way error format, shared by the server and the client the same way codecs
are, with an optional OpenAPI schema:

```ts
const problemJson = errorFormat({
	contentType: "application/problem+json",
	// server: a RouteError to a body
	serialize: ({ code, status, message, data }) => ({
		type: `https://example.com/errors/${code}`,
		title: message,
		status,
		code,
		...data,
	}),
	// client: a body back to the fields of a RouteError, or undefined when the
	// body isn't in this format, which rejects with a plain Error as today
	deserialize: (body) =>
		isProblem(body)
			? { code: body.code, message: body.title, data: omitProblemFields(body) }
			: undefined,
	// OpenAPI: the schema of error responses, given a definition's data schema
	openAPI: (dataSchema) => problemSchema(dataSchema),
});

createApp(routes, { errorFormat: problemJson });
createClient(api, { baseUrl, errorFormat: problemJson });
```

- Route types don't change. A definition's code, status and `data` stay typed,
  and only the wire format changes. The format is one stated, documented rule,
  so you can still tell from the API how to read its errors.
- Lossy formats work too. A `text/plain` format could send only the message, and
  its `deserialize` could map the status back to a code. That works when each
  status is defined by at most one error code on a route, and otherwise the
  error is untyped.
- Built-in errors such as `REQUEST_VALIDATION_FAILED` go through the same
  format, so the whole API is consistent.

## 13. Interceptors

### Server

Cross-cutting work that has to happen before routing, or to every response,
including errors, has no place in rest-rpc today:

- cheap checks such as an API key, an allowed IP or a maintenance mode;
- request IDs, logging and timing across every route;
- headers on every response, such as CORS or security headers. CORS also has
  to answer `OPTIONS` preflights, and its headers have to be on error
  responses, or the browser hides the error from the client.

Route middleware can't do these: it runs after request validation by design,
and it doesn't see error responses, `notFound`, or preflights. So users wrap
`createApp` themselves. On Bun that also means wrapping every native route,
because its router calls the handlers in `routes` directly, and rebuilding
static routes, which are `Response` values.

**Fix sketch:** a list of interceptors on `createApp`, each wrapping everything
rest-rpc does for a request, composed like middleware:

```ts
import { interceptor } from "@rest-rpc/server";

const apiKey = interceptor(({ request, next }) =>
	request.headers.get("x-api-key") === env.API_KEY
		? next()
		: new Response("Forbidden", { status: 403 }),
);

const timing = interceptor(async ({ next }) => {
	const started = performance.now();
	const response = await next();
	response.headers.set(
		"server-timing",
		`app;dur=${performance.now() - started}`,
	);
	return response;
});

createApp(routes, { interceptors: [timing, apiKey, cors] });
```

- **Shape:** `interceptor()` types the function, like `bodyCodec()` and
  `sseFormat()`, and returns it unchanged. It takes one object argument, like
  handlers and `.use()`, so a field can be added later without changing the
  signature. `next()` continues with the
  same request, and `next(request)` with another one.
- **Order:** onion-style, like `.use()`: the first interceptor wraps every one
  after it, and rest-rpc's own handling is innermost. Each concern is its own
  function, so apps and libraries can ship them and combine them without
  wrapping one in another.
- **Reuse:** the runner can share the middleware composition. The difference is
  that an interceptor may call `next` more than once, to retry, which
  middleware forbids.
- It runs before routing, so it sees every request, including unmatched ones
  and `OPTIONS`.
- `next` returns the final response, including error responses and `notFound`.
- `createApp` applies it to Bun's native `routes` too, so nothing has to be
  wrapped per route.
- CORS is then a docs example rather than its own option: one interceptor
  answers preflights and adds the headers to every response.
- It's untyped on purpose: it's about HTTP, not routes. Typed, per-route logic
  stays in middleware.
- Node `createApp` needs its own shape, probably `{ req, res, next }`, because
  it writes to a `ServerResponse` instead of returning a `Response`. That's an
  open question.

### Client

The client has the `fetch` option as its escape hatch, but replacing `fetch` is
easy to get wrong:

- `(input, init)` has to be passed on exactly as received, including `signal`,
  which carries `timeoutMs` and the caller's abort.
- Retrying a request with a body means rebuilding it, because a body can only be
  read once.
- Refreshing a token and replaying the request needs the same care, and has to
  avoid loops.
- It doesn't know which route is being called, so per-route logic has to parse
  the URL back into a route.

**Fix sketch:** the same list on `createClient`, with the route as context:

```ts
import { clientInterceptor } from "@rest-rpc/core";

const refreshOn401 = clientInterceptor(async ({ request, next, route }) => {
	const response = await next(request.clone());
	if (response.status !== 401 || route.meta?.access === "public") {
		return response;
	}
	await refreshToken();
	request.headers.set("authorization", `Bearer ${readToken()}`);
	return next(request);
});

createClient(api, { baseUrl, interceptors: [logging, refreshOn401] });
```

- `request` is a Fetch `Request`, so cloning and replaying it is standard and
  safe.
- `next` calls `fetch`, or the `fetch` option, with the signal handled.
- `clientInterceptor()` has its own name, since `@rest-rpc/server` re-exports
  core helpers and code may import from both.
- `route` gives the route definition, including `meta`, so per-route
  behaviour needs no URL parsing.
- It runs before the response is decoded, so it sees error responses too.

Both lists are the same primitive with the same scope: functions around the
HTTP exchange, composed in order. Neither needs a plugin system.

## 14. Wildcard path params (maybe)

Only `:name` segments are supported, so a route can't match the rest of a path.
That rules out file serving (`/files/*path`), proxies, and SPA fallbacks.

The matcher isn't the problem. rou3, which `createApp` uses, has catch-all
syntax (`**`, with a named variant), and Bun's router supports `/*`. The
problems are elsewhere:

- **Framework integration:** `createRouteHandlers` gives each route's path to
  the framework's router. `:name` works almost everywhere, but wildcards don't
  share a syntax. Bun uses `/*`, Express 5 uses `*name`, and Hono uses `*` or a
  regex parameter. They'd need translating per framework, or a documented
  "not supported by framework integration" caveat.
- **OpenAPI:** there's no standard way to describe a parameter that spans
  several segments, so the document can't describe it exactly.
- **The client:** it has to encode the value without escaping the `/`s, unlike
  other params.

**Fix sketch, if it's done:** a rest segment such as `:path*` at the end of a
path, typed `string`, supported by `createApp` and `createCatchAllHandler`.
Framework integration would translate it where it can and document where it
can't. Until then, a catch-all handler mounted under the prefix covers the need
on the host side.

## Docs to write

Decisions that are made, but that the docs don't explain yet. Write them once
the before-stable items are done.

- Rewrite the HTTP behaviour pages to explain the contract: how content types
  are chosen, what the client receives compared with what the server sends,
  and the pitfalls.
- Trade-offs to document, not change:
  - A content type is never inferred from a value, except where there's
    nothing to choose: SSE for async iterables, raw for a returned `Response`,
    and `multipart/form-data` for `FormData`, whose boundary only Fetch can
    generate.
  - One body schema per status. It can be a union, but a body type can't be
    paired with a content type. Pairing can be added later without breaking
    anything.
  - Interceptors are outside the typed contract. They can change anything about
    the response, and the docs say what that means instead of restricting it.
  - Request bodies are read whole before they're decoded, multipart included.
    Streaming uploads are out of scope: a custom codec gets the raw body
    stream, and an upload route can live on the host framework.
  - The error format stays `{ code, message, data? }` unless the option is
    added.

### Decided against, with the reasons

- **Request body size limits:** frameworks, proxies and gateways already
  provide them, and rest-rpc shouldn't maintain its own:
  - **Any bug is a security issue.** The idea is simple, but a single bug in
    counting or enforcing the limit becomes rest-rpc's security issue instead of
    the host's.
  - **It costs performance on every body.** Bodies are read in different ways
    on Node and on Fetch runtimes, and each way would need limit checks. That
    undoes the body-reading performance work, unless each runtime gets its own
    fast path for when no limit applies. Every extra path is another place for
    that single bug.

  Leaving it out keeps the number of security-sensitive code paths small. One
  docs note is still worth adding: Node `createApp` has no framework in front of
  it, so there the limit must come from a proxy or from wrapping the listener.

- **Middleware before request validation:** this is by design. If declaration
  order decided whether input is validated, as in tRPC or oRPC, that would be a
  bigger security footgun than the cheap work it would save. Cheap checks belong
  outside rest-rpc, or in the server interceptor (case 13), which runs before
  routing.

### Security boundaries

The decisions above follow one rule: rest-rpc keeps few security-sensitive
code paths, and leaves the rest to the host. That's only safe if the docs say
clearly what's left to the user. A short "Security boundaries" section or page
could list them:

- **Left to the host or proxy:**
  - request body size limits, with the Node `createApp` caveat;
  - rate limiting;
  - request and header timeouts, such as Node's `server.requestTimeout` and
    `headersTimeout`;
  - TLS.
- **Left to the app:**
  - authentication and authorization, in middleware or an interceptor;
  - CORS, until interceptors land, and then as an interceptor;
  - `Set-Cookie` attributes such as `HttpOnly`, `Secure` and `SameSite`, which
    `cookies` sends as written;
  - CSRF. A route decodes only the content types it declares, JSON by default,
    but that's the contract, not CSRF protection. Whether an app is exposed
    depends on how it's built: a route that accepts forms with cookie auth
    can be, while token auth in a header, or cookies with `SameSite=Lax` or
    `Strict`, aren't exposed the usual ways. The docs should explain how the
    attack works and when it applies, instead of recommending a protection
    for every app. For the apps that need one, show the check frameworks
    ship, such as NestJS's built-in one, oRPC's plugin and Go's
    `CrossOriginProtection`: reject unsafe methods whose `Sec-Fetch-Site` or
    `Origin` is cross-origin, and never check `GET`, `HEAD` or `OPTIONS`. It's
    a few lines in middleware or an interceptor.
- **What rest-rpc does:**
  - request validation runs before middleware, and its issues are sent to the
    caller, which is useful for clients but shows the schema shape to anyone;
  - response validation failures are hidden as `500` errors without details;
  - error `cause`s are never sent;
  - and anything else it guarantees.

## Summary

| Case                             | Today                                                     | Fix sketch                                                  | New concept |
| -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- | ----------- |
| 1. Native values in JSON         | Client typed `Date`, receives `string`                    | `Jsonify<T>` client bodies                                  | No          |
| 2. Binary bodies                 | Client typed server's type, gets `Blob`                   | Client type from what the `content-type` header decodes to  | No          |
| 4. Raw stream chunks             | Compiles, connection cut at runtime                       | Restrict handler stream chunks to `string \| Uint8Array`    | No          |
| Form bodies as objects           | `URLSearchParams` and `FormData`, read by field name      | Objects under the query rules, converted in the form codecs | No          |
| 6. Error response format         | Fixed JSON; rewrite responses on both ends                | Two-way `errorFormat` shared by server and client           | Yes         |
| 13. Interceptors                 | Wrap `createApp` (and every Bun route) or replace `fetch` | An `interceptors` list on the app and the client            | Yes         |
| 14. Wildcard path params (maybe) | Not supported                                             | `:path*` rest segment where routers support it              | Yes         |
