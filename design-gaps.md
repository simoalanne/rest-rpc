# Design gaps

Places where the current API either can't express an ordinary route, gives the
client a type that doesn't match what it receives, or doesn't follow the
protocol it implements.

- [Content types as headers](#content-types-as-headers) is decided: content
  types stop being their own concept. It solves the old cases 3 (content type
  parameters) and 5 (content types known only at runtime) by construction, and
  cases 1, 2 and 4 build on it.
- Cases 1, 2 and 4 are about body types. They're ordered by how many users are
  likely to hit them.
- Case 6, the error format, is lower value and needs a new feature, but it
  covers a gap with no realistic escape hatch.
- Cases 7 to 10 (server-sent events, redirects, raw responses and `HEAD`
  requests) are done, or covered by returning a Fetch `Response`. Case 12, the
  OpenAPI document, is documented as a best-effort conversion for now. Case
  numbers are kept so references to the other cases stay valid.
- Case 11 is CORS, which apps can't add cleanly today.
- Case 13 is interceptors on the server and the client: one primitive that
  replaces users' own wrappers, and covers most of case 11.
- Case 14 is wildcard path params, which may not be worth doing.
- The end lists what was considered and decided against, and the security
  boundaries to document.
- [Path to stable](#path-to-stable), below, sorts all of it into what has to
  land before a stable release and what can be added later.

Each case shows realistic code as it works today, the best escape hatch
available, and a sketch of a fix. The sketches are directions, not final API.
The types and errors quoted below were checked against the current code.

## Path to stable

The API can be considered stable once everything left only adds to it. Most
cases here are additive. Only a few change existing types or behaviour, and
those have to land, or be explicitly decided against, first.

### Before stable: changing these later would break users

| Case                              | Why it can't wait                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content types as headers          | Removes the `contentType` option, handler argument, client input and result field, and the media-type records in `.body()` and `.response()`. It's the most breaking change here. |
| 1 and 2: honest client body types | `Jsonify<T>` and `Blob` for binary narrow existing client types. Ship them with the opt-out, so apps whose codecs restore native types keep their types.                          |
| 4: stream chunk types in handlers | Restricting the handler's return type to `string \| Uint8Array` chunks is a breaking type change.                                                                                 |

### After stable: additive

- 6: the error format option.
- 11 and 13: CORS and the interceptors.
- 14: wildcard path params.

### Decided trade-offs to document, not change

- JSON by default, with any other content type stated in a `content-type`
  header. A content type is never inferred from a value, except where there's
  nothing to choose: SSE for async iterables, raw for a returned `Response`,
  and `multipart/form-data` for `FormData`, whose boundary only Fetch can
  generate.
- A route decodes only the request content types it declares.
- One body schema per status. It can be a union, but a body type can't be
  paired with a content type. Pairing can be added later without breaking
  anything.
- Interceptors are outside the typed contract. They can change anything about
  the response, and the docs say what that means instead of restricting it.
- Request validation runs before middleware.
- No request body size limits.
- Request bodies are read whole before they're decoded, multipart included.
  Streaming uploads are out of scope: they'd make every common form harder to
  handle. A custom codec gets the raw body stream, and an upload route can live
  on the host framework.
- The error format stays `{ code, message, data? }` unless the option is added.
- The security boundaries listed at the end.

### Docs to write once the "before stable" items are done

- Rewrite the HTTP behaviour pages to explain the contract: how content types
  are chosen, what the client receives compared with what the server sends,
  and the pitfalls.
- Explain the decided-against items, with the reasons.
- Add the security boundaries section.

## Content types as headers

Today a content type is its own concept, in five places: the `contentType`
option of `respond()`, the `contentType` handler argument, `contentType` in the
client's input and result, and media-type-keyed records in `.body()` and
`.response()`. Its gaps, such as parameters on declared types and types known
only at runtime, would each make that system bigger to fix. Instead, a content
type is only ever a `content-type` header, on both the request and the response.

### The rule

> A body is JSON unless a `content-type` header says otherwise. The header's
> media type selects the codec, and the full value, parameters included, goes
> to the codec. An async iterable is SSE, a returned `Response` is sent as it
> is, and `FormData` is sent as `multipart/form-data` with the boundary Fetch
> generates, ignoring any `content-type` header.

The content type is never inferred from any other value. A `Blob` returned
without a header is a type error, because it can't be sent as JSON (case 1).
Inferring from values is a list that never ends: strings as `text/plain`, a
`Blob` with its own type, then an empty `blob.type`, a string that's really
HTML. One default, and an error that points to the header, is a rule that
doesn't grow, and the header marks the places where a route does something other
than JSON.

That gives one mental model for the whole API:

- **Request:** a typed `Request`, with params, query, headers and body.
- **Response:** a typed `new Response(body, { status, headers })`.
- **Codecs:** the one controlled place that decides how bodies go over the wire,
  selected by the `content-type` header. They're registered by media type, as
  today, and get the full header value.

Libraries that focus on type safety, such as tRPC, oRPC, Hono RPC and Elysia,
don't key schemas by media type either. They key responses by status, default
to JSON, and use a header or a helper as the escape hatch. What this design
gives up, typed pairing between several content types on one route, is the
feature none of them built.

### Responses

```ts
// Default: JSON
route.get("/todos/:id").handler(({ params }) => db.todos.find(params.id));

// Another type: set the header, parameters included.
route.get("/todos/export").handler(({ respond }) =>
	respond(toCsv(todos), {
		headers: { "content-type": "text/csv; charset=utf-8" },
	}),
); // client body: string, from the literal header

// A content type known only at runtime is just a string.
route.get("/users/:id/avatar").handler(async ({ params, respond }) => {
	const file = await storage.get(`avatars/${params.id}`);
	return respond(file, { headers: { "content-type": file.type } });
}); // client body: Blob

route.get("/file").handler(() => blob); // type error: set a content-type header

// Declared: the content type is part of the headers schema. With one value, a
// schema default sets it, so the handler never writes it.
route
	.get("/todos/export")
	.response(z.string(), {
		headers: z.object({
			"content-type": z.literal("text/csv").default("text/csv"),
		}),
	})
	.handler(() => toCsv(todos)); // sent as text/csv. client body: string

// Patterns come from the schema library, not from rest-rpc.
route.get("/users/:id/avatar").response(z.instanceof(Blob), {
	headers: z.object({
		"content-type": z.templateLiteral(["image/", z.string()]),
	}),
});

// SSE: a stream is a body shape, not a content type, so it keeps its marker.
route.get("/todos/activity").response(sse(change));
```

- Response headers are validated as the handler wrote them, and the codec is
  selected from the validated headers, which are also the ones sent. A schema
  default fills a missing `content-type`. Only if it's still missing after
  validation does rest-rpc fall back to JSON. A schema that requires a
  `content-type` without a default makes the handler write it, and the types
  say so.
- The value is sent and received as written, such as `text/csv; charset=utf-8`
  with `z.string().startsWith("text/csv")`. The server writes it itself, so
  there's nothing to normalize.
- The client reads it as `res.headers["content-type"]`, which replaces
  `res.contentType`.

### Requests

```ts
// JSON, as today
route.post("/todos").body(todoInput);

// Another type is declared the ordinary way, in the headers.
route
	.post("/todos/import")
	.headers(z.object({ "content-type": z.literal("text/csv") }))
	.body(z.string());

await client.todos.create({ body: { title: "Write docs" } }); // JSON
await client.todos.import({
	headers: { "content-type": "text/csv" },
	body: csv,
});
await client.files.upload({ body: formData }); // multipart, boundary from fetch
```

- **A route decodes only the content types it declares.** The server validates
  the headers before it decodes the body, and selects the codec from the
  validated `content-type`. Without one, the body must be JSON, and any other
  content type is answered with `415`. A schema checks a value's shape, not the
  format it was sent in, so a handler would otherwise receive a value from a
  decoder its author never chose, such as a form's strings where JSON would have
  numbers. Today the body is decoded before the request is validated, so this
  changes the order.
- An object schema that doesn't declare `content-type` strips it, so the route
  is JSON only. Unchecked and loose headers schemas let every header through,
  which is the user's choice, as with any other header.
- **Schemas see the normalized media type**, lowercase and without parameters,
  so `z.literal("text/csv")` matches senders that add a charset, and
  `z.literal("multipart/form-data")` matches despite the `boundary`. The codec
  gets the full header value. It's the one header a schema sees in a different
  form than it arrived, which needs a line in the docs.
- **The client call writes the content type**, the same literal the schema
  declares. The call site is where the request is built, so that's where a body
  that isn't JSON should be visible. A schema default can't do it for requests,
  because the client doesn't run the route's schemas: an extracted contract
  drops them. The codec is chosen from the call's typed `headers`, so a
  `content-type` in `additionalHeaders` or `globalHeaders` doesn't select one,
  and the server would answer it with `415` anyway.
- **A `FormData` body** is always sent as `multipart/form-data`, and any
  `content-type` header is ignored. The boundary has to come from Fetch, so a
  header written by hand would only break it. The route still declares
  `multipart/form-data` to accept it.
- **OpenAPI:** content keys come from the `const` or `enum` of the converted
  headers schema, and `content-type` is left out of the documented header
  parameters, since OpenAPI ignores it there. Without a readable value, the
  content key is `*/*`.

### Several content types on one route

One schema per status, which can be a union. The body and the header are each
validated, and OpenAPI lists every content type, but they aren't paired:

```ts
route
	.get("/todos")
	.headers(z.object({ accept: z.string().optional() }))
	.response(z.union([z.array(todo), z.string()]), {
		headers: z.object({
			"content-type": z.enum(["application/json", "text/csv"]),
		}),
	})
	.handler(({ headers, respond }) =>
		headers.accept === "text/csv"
			? respond(toCsv(todos), { headers: { "content-type": "text/csv" } })
			: respond(todos, { headers: { "content-type": "application/json" } }),
	);
```

- The schema doesn't stop `toCsv(todos)` from being sent with
  `application/json`. The `respond()` call does, as long as the JSON-safe check
  from case 1 runs per call.
- The client can't narrow `body` by checking `res.headers["content-type"]`,
  because TypeScript doesn't narrow a union by a nested property. It narrows by
  the value instead, or casts. Case 2 describes the client types of such
  unions.
- The same applies to request bodies: a union body, and a header check in the
  handler.

Pairing could come back later as an additive form, such as several `.response()`
calls for one status told apart by a literal `content-type`. Routes with a
single schema wouldn't change.

### Form bodies as objects

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
	.headers(
		z.object({
			"content-type": z.string().startsWith("multipart/form-data"),
		}),
	)
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
  `FormData` body is always sent as it is, with the inference exception from
  [the rule](#the-rule). It isn't type-checked on the client, but the server
  decodes it to the same object and validates it, so a mismatch is still caught,
  as a `400`.
- **`URLSearchParams`** stops being a value type. It's only the urlencoded side
  of the same rules, and the client sends an object with the urlencoded header.

Decided details:

1. **Arrays use `[]` keys.** Query strings and both form types read arrays
   only from `key[]` keys, the convention OpenAPI describes with `style: form`
   and `explode: true`. `<select multiple name="tags">` sends `tags=a&tags=b`,
   and only the last value is kept, so HTML forms use `name="tags[]"`. Without
   the suffix, `tags=a` could be a string or an array, and the server can't tell
   which from the schema. It's one documented caveat for all three places.
2. **Multipart responses (decided).** The conversion lives in the form codecs:
   `deserialize` turns the decoded form into an object, and `serialize` builds
   one from an object, passing a `FormData` instance through unchanged. The
   client and the server share the codecs, so request bodies on the server and
   response bodies on the client are objects alike, with nothing to decide
   separately.
3. **Node (checked).** Both runtimes already decode multipart with the same
   codec, which reads the body and hands it to Fetch's `Response.formData()`, so
   file fields are `File`s on Node too. The conformance tests cover it on both.
   Converting that `FormData` to an object is a plain function on top, the same
   on every runtime.

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
	.response({ "application/octet-stream": z.instanceof(Uint8Array) })
	.handler(({ params }) => storage.read(params.id)); // Uint8Array

const { body } = await client.files.download({ params: { id } });
body; // typed: Uint8Array. received: Blob
body.byteLength; // compiles, undefined at runtime
```

Inferred routes have the same problem:

```ts
route.get("/files/:id").handler(({ params, respond }) =>
	respond(storage.read(params.id), {
		contentType: "application/octet-stream",
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

A body union under one header, as in
[several content types on one route](#several-content-types-on-one-route), needs
rules to stay honest, because `Jsonify<Blob>` would be an empty object that
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
		{ contentType: "application/x-ndjson" },
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

## 11. CORS

`createApp` has no CORS support. `onError` can't add headers, and route
middleware never sees a preflight, because no route answers `OPTIONS`. CORS
headers also have to be on error responses, or the browser hides the error from
the client, and those are written by rest-rpc itself.

How much work it takes depends on the runtime:

- **Fetch runtimes (Deno, Workers):** wrap `fetch` once. Answer `OPTIONS`, and
  add the headers to every response.
- **Bun:** wrapping `fetch` isn't enough, because Bun's native router calls the
  handlers in `routes` directly. Every route has to be wrapped separately, and
  an `OPTIONS` entry added for each path. Static routes are `Response` values,
  so they have to be rebuilt with the headers.

  ```ts
  const app = createApp(routes);
  const withCors = (response: Response) => {
  	const headers = new Headers(response.headers);
  	headers.set("access-control-allow-origin", "https://app.example.com");
  	headers.set("access-control-expose-headers", "location, x-request-id");
  	return new Response(response.body, { status: response.status, headers });
  };

  Bun.serve({
  	fetch: async (request) => withCors(await app.fetch(request)),
  	routes: Object.fromEntries(
  		Object.entries(app.routes).map(([path, methods]) => [
  			path,
  			{
  				...Object.fromEntries(
  					Object.entries(methods).map(([method, handler]) => [
  						method,
  						handler instanceof Response
  							? withCors(handler) // static: rebuilt once
  							: async (request: Request) => withCors(await handler(request)),
  					]),
  				),
  				OPTIONS: () => preflight(Object.keys(methods)),
  			},
  		]),
  	),
  });
  ```

  Dropping `routes` and serving only `fetch` avoids this, but gives up Bun's
  native routing.

- **Node `createApp`:** wrap the handler, and set headers on the
  `ServerResponse` before rest-rpc writes it.
- **Framework integration:** use the framework's CORS middleware, such as Hono's
  `cors()` or the Express `cors` package. This works, but it means dropping
  down a level just for CORS. Exposed headers also have to be listed by hand,
  and kept in sync with the routes.

### Fix sketch

A minimal `cors` option on both `createApp`s, applied to every response,
errors included, and to Bun's `routes`:

```ts
createApp(routes, {
	cors: {
		origin: ["https://app.example.com"], // or a function of the request origin
		credentials: true,
		maxAge: 600,
	},
});
```

The rest can be derived from the routes:

- **Preflight methods:** from the routes defined at each path. A path with only
  `GET` and `PATCH` routes answers with those, instead of a fixed list.
- **Allowed request headers:** from each route's headers schema, plus
  `content-type` for routes with a body.
- **Exposed response headers:** from declared response headers and error
  headers, so a declared `location` or `x-request-id` is readable from the
  browser without listing it again. This is something a framework's CORS
  middleware can't do, because it doesn't know the routes.

Anything beyond the minimal options, such as per-route policies, still drops
down to framework integration.

With the server interceptor from case 13, this may not need its own feature. A
preflight answer and headers added to every response are a few lines in an
interceptor, so `cors` could be a small helper built on it, or a docs example.

## 13. Interceptors

### Server

Cross-cutting work that has to happen before routing, or to every response,
including errors, has no place in rest-rpc today:

- cheap checks such as an API key, an allowed IP or a maintenance mode;
- request IDs, logging and timing across every route;
- headers on every response, such as CORS (case 11) or security headers.

Route middleware can't do these: it runs after request validation by design,
and it doesn't see error responses, `notFound`, or preflights. So users wrap
`createApp` themselves. On Bun that also means wrapping every native route, as
case 11 shows.

**Fix sketch:** one hook on `createApp` that wraps everything rest-rpc does for
a request:

```ts
createApp(routes, {
	intercept: async (request, next) => {
		if (request.headers.get("x-api-key") !== env.API_KEY) {
			return new Response("Forbidden", { status: 403 });
		}
		const started = performance.now();
		const response = await next(request);
		response.headers.set("x-request-id", crypto.randomUUID());
		response.headers.set(
			"server-timing",
			`app;dur=${performance.now() - started}`,
		);
		return response;
	},
});
```

- It runs before routing, so it sees every request, including unmatched ones
  and `OPTIONS`.
- `next` returns the final response, including error responses and `notFound`.
- `createApp` applies it to Bun's native `routes` too, so nothing has to be
  wrapped per route.
- It's untyped on purpose: it's about HTTP, not routes. Typed, per-route logic
  stays in middleware.
- Node `createApp` needs its own shape, probably `(req, res, next)`, because it
  writes to a `ServerResponse` instead of returning a `Response`. That's an open
  question.

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

**Fix sketch:** the same hook on `createClient`, with the route as context:

```ts
createClient(api, {
	baseUrl,
	intercept: async (request, next, { route }) => {
		let response = await next(request.clone());
		if (response.status === 401 && route.meta?.access !== "public") {
			await refreshToken();
			request.headers.set("authorization", `Bearer ${readToken()}`);
			response = await next(request);
		}
		return response;
	},
});
```

- `request` is a Fetch `Request`, so cloning and replaying it is standard and
  safe.
- `next` calls `fetch`, or the `fetch` option, with the signal handled.
- The `route` context gives the route definition, including `meta`, so
  per-route behaviour needs no URL parsing.
- It runs before the response is decoded, so it sees error responses too.

Both hooks are the same primitive with the same scope: one function around the
HTTP exchange. Neither needs a plugin system.

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

## Decided against

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

## Follow-up: document the security boundaries

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
  - CORS, until case 11 or 13 lands;
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

| Case                               | Today                                                     | Fix sketch                                                    | New concept |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| Content types as headers (decided) | Content type is its own concept in five places            | Only a `content-type` header; JSON unless it says otherwise   | One fewer   |
| 1. Native values in JSON           | Client typed `Date`, receives `string`                    | `Jsonify<T>` client bodies                                    | No          |
| 2. Binary bodies                   | Client typed server's type, gets `Blob`                   | Client type from what the `content-type` header decodes to    | No          |
| 4. Raw stream chunks               | Compiles, connection cut at runtime                       | Restrict handler stream chunks to `string \| Uint8Array`      | No          |
| 6. Error response format           | Fixed JSON; rewrite responses on both ends                | Two-way `errorFormat` shared by server and client             | Yes         |
| 11. CORS                           | Wrap `fetch`; on Bun, every route                         | `cors` option, with methods and headers derived from routes   | Yes         |
| 13. Interceptors                   | Wrap `createApp` (and every Bun route) or replace `fetch` | One `intercept(request, next)` hook on the app and the client | Yes         |
| 14. Wildcard path params (maybe)   | Not supported                                             | `:path*` rest segment where routers support it                | Yes         |
