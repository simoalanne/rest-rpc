# Design gaps

Places where the current API either can't express an ordinary route, gives the
client a type that doesn't match what it receives, or doesn't follow the
protocol it implements.

- [Content types as headers](#content-types-as-headers) proposes removing
  content types as their own concept. It changes the fix sketches of cases 1
  to 5, and solves cases 3 and 5 by construction.
- Cases 1 to 5 are about content types and body types. They're ordered by how
  many users are likely to hit them.
- Case 6, the error format, is lower value and needs a new feature, but it
  covers a gap with no realistic escape hatch.
- Cases 7 to 10 (server-sent events, redirects, raw responses and `HEAD`
  requests) are done, or covered by returning a Fetch `Response`. Case 12, the
  OpenAPI document, is documented as a best-effort conversion for now. Their
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

| Case                              | Why it can't wait                                                                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content types as headers          | Removes the `contentType` option, handler argument, client input and result field, and the media-type records in `.body()` and `.response()`. It's the most breaking change here, and cases 1 to 5 are built on whichever design is chosen, so it has to be decided first. |
| 1 and 2: honest client body types | `Jsonify<T>` and `Blob` for binary narrow existing client types. Ship them with the opt-out, so apps whose codecs restore native types keep their types.                                                                                                                   |
| 4: stream chunk types in handlers | Restricting the handler's return type to `string \| Uint8Array` chunks is a breaking type change.                                                                                                                                                                          |

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
- One body schema per status. It can be a union, but a body type can't be
  paired with a content type. Pairing can be added later without breaking
  anything.
- Interceptors are outside the typed contract. They can change anything about
  the response, and the docs say what that means instead of restricting it.
- Request validation runs before middleware.
- No request body size limits.
- The error format stays `{ code, message, data? }` unless the option is added.
- The security boundaries listed at the end.

### Docs to write once the "before stable" items are done

- Rewrite the HTTP behaviour pages to explain the contract: how content types
  are chosen, what the client receives compared with what the server sends,
  and the pitfalls.
- Explain the decided-against items, with the reasons.
- Add the security boundaries section.

## Content types as headers

Today a content type is its own concept, in five places:

- the `contentType` option of `respond()`;
- the `contentType` handler argument;
- `contentType` in the client's input;
- `contentType` in the client's result;
- media-type-keyed records in `.body()` and `.response()`.

Cases 2 to 5 are mostly gaps in that system, and fixing them one by one makes it
bigger: parameters on declared types, patterns, and per-type client decoding.
The alternative is to remove the concept. A content type is only ever a
`content-type` header, on both the request and the response.

### The rule

> A body is JSON unless a `content-type` header says otherwise. The header's
> media type selects the codec, and the full value, parameters included, goes
> to the codec and is sent. An async iterable is SSE, a returned `Response` is
> sent as it is, and `FormData` is sent as `multipart/form-data` with the
> boundary Fetch generates, ignoring any `content-type` header.

The content type is still never inferred from any other value. A `Blob`
returned without a header is a type error, because it can't be sent as JSON
(case 1).

Inferring from values is a list that never ends. It starts with simple rules,
such as strings as `text/plain` and `Blob` with its own type, and then edge
cases keep adding rules: an empty `blob.type`, a string that's really HTML, an
object holding a file. Each new rule is one more thing to know before you can
read a route, and some values still fall through to an error sooner or later.
One default, and an error that points to the header, is a rule that doesn't
grow. Asking for the header isn't explicitness for its own sake: it marks the
places where a route does something other than JSON.

That gives one mental model for the whole API:

- **Request:** a typed `Request`, with params, query, headers and body.
- **Response:** a typed `new Response(body, { status, headers })`.
- **Codecs:** the one controlled place that decides how bodies go over the wire,
  selected by the `content-type` header.

Everything a route author writes is an ordinary HTTP concept. Codecs are
app-level configuration, and most apps never touch them.

### Why

Content types are rarely something anyone thinks about. Popular libraries that
focus on type safety don't make them a dimension of the contract:

- **tRPC:** always JSON, with special cases for FormData and binary inputs.
- **oRPC:** content type from the value (`File`/`Blob`, event iterators, JSON),
  and headers in the detailed output.
- **Hono RPC:** chosen by the response helper (`c.json()`, `c.text()`) and the
  validator target (`json`, `form`).
- **Elysia:** inferred from the value, and overridden by mutating
  `set.headers["content-type"]`, often in lifecycle hooks.

None of them key schemas by media type. They key responses by status, default
to JSON, and use a header as the escape hatch. Elysia is the closest to this
design. The difference is that here the header is part of the value the handler
returns, not a mutation after it:

- the client body type can follow the header (case 2);
- the handler's return value says what's sent, so there's no hook order to
  reason about;
- declared routes validate the header like any other, and OpenAPI can read it.

What this design gives up, typed pairing between several content types on one
route, is the feature none of those libraries built.

### Sketch

Responses:

```ts
// Default: JSON
route.get("/todos/:id").handler(({ params }) => db.todos.find(params.id));

// Escape hatch: set the header. Parameters flow as they are (case 3).
route.get("/todos/export").handler(({ respond }) =>
	respond(toCsv(todos), {
		headers: { "content-type": "text/csv; charset=utf-8" },
	}),
); // client body: string, from the literal header

// A content type known only at runtime is just a string (case 5).
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
// sse() marks the body as a stream of `change`, instead of returning a record entry.
route.get("/todos/activity").handler(async function* () {
	/* … */
});
route.get("/todos/activity").response(sse(change));

route
	.get("/robots.txt")
	.static(
		respond("User-agent: *", { headers: { "content-type": "text/plain" } }),
	);
```

Requests:

```ts
// JSON, as today
route.post("/todos").body(todoInput);

// Another type is declared the ordinary way, in the headers.
route
	.post("/todos/import")
	.headers(z.object({ "content-type": z.literal("text/csv") }))
	.body(z.string());
```

A schema default doesn't work for requests the way it does for responses. The
server owns both validating and sending a response, but the client sends a
request without running its schemas: an extracted client contract keeps body
media types and drops the schemas. A request header the client leaves out
would send the body as JSON, while the server's default claimed `text/csv`. So
the client call writes the content type, which is also where it's most useful
to see (edge case 1).

Client:

```ts
await client.todos.create({ body: { title: "Write docs" } }); // JSON
await client.todos.import({
	headers: { "content-type": "text/csv" },
	body: csv,
});
await client.files.upload({ body: formData }); // multipart, boundary from fetch

// When checking the content type against the route isn't important, it can be
// set like any other untyped header, outside the route's headers.
await client.todos.import(
	{ body: csv },
	{ additionalHeaders: { "content-type": "text/csv" } },
);

const res = await client.todos.get({ params: { id } });
res.headers["content-type"]; // replaces res.contentType
```

The client picks the codec from the final request headers, after
`globalHeaders`, `additionalHeaders` and the route's `headers` are merged, so
all three work the same way. What the server accepts is still decided by the
route.

Codecs don't change. They're still registered by media type, and they get the
full header value.

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
  from case 1 runs per call (see below).
- The client can't narrow `body` by checking `res.headers["content-type"]`,
  because TypeScript doesn't narrow a union by a nested property. It narrows by
  the value instead, or casts.
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
  it's sent as JSON. Nothing is inferred from the value. The header can come
  from the route's `headers` or from `additionalHeaders`. The client types
  don't check that the header and the body fit together. Forgetting the header
  fails loudly on the first call, as a `400`, because a `File` sent as JSON
  doesn't pass the server's schema. A check would need request body types that
  depend on the header, and it still couldn't see `additionalHeaders` or
  `globalHeaders`.
- **A `FormData` instance** is what a React form gives you. Converting it to an
  object and casting, or building it back from a loosely typed object, would be
  busywork that loses as much type safety as it pretends to add. So a
  `FormData` body is always accepted as it is, with the inference exception from
  [the rule](#the-rule). It isn't type-checked on the client, but the server
  decodes it to the same object and validates it, so a mismatch is still caught,
  as a `400`.
- **`URLSearchParams`** stops being a value type. It's only the urlencoded side
  of the same rules, and the client sends an object with the urlencoded header.

To settle:

1. **The `boundary` parameter.** A multipart `content-type` always has one, so
   `z.literal("multipart/form-data")` can never match a real request. This
   makes [edge case 2](#edge-cases-to-decide) unavoidable. Either schemas see
   the normalized media type, or every multipart route uses `startsWith`.
2. **Arrays without `[]`.** `<select multiple name="tags">` sends
   `tags=a&tags=b`, and under the query rules only the last value is kept. HTML
   forms need `name="tags[]"`. It's the same ambiguity as in query strings,
   where `tags=a` could be a string or an array, so it's one documented caveat
   for all three places.
3. **Multipart responses.** These are rare. Decoding them to an object on the
   client is symmetric, but they could also stay `FormData`.
4. **Node.** Multipart decoding has to produce `File`s on both runtimes. Check
   what the Node path does today before promising it.

### Edge cases to decide

1. **Which request content types a route accepts.** A JSON route must keep
   answering `415` to `text/plain`, form and multipart bodies. Browsers send
   those cross-origin without a preflight, so rejecting them is real CSRF
   protection. Today's records give that for free. Without them, the server has
   to know what a route accepts before it decodes the body, and Standard Schema
   can't tell it what a headers schema allows. Options:
   - **JSON only, unless the validated headers contain `content-type`.** Headers
     are validated before the body anyway, and an object schema that doesn't
     declare the key strips it. A passthrough schema accepts every type, which
     is the user's explicit choice but needs a docs note.
   - **A plain-string opt-in on the body**, such as
     `.body(z.string(), { accepts: "text/csv" })`. It's explicit and readable
     at runtime, but it's a content-type concept again, in one place. It
     survives contract extraction, so the client could send a single accepted
     type by itself, but that isn't a reason to choose it: see below.

   Either way, the client call writes a non-JSON request content type. The call
   site is where the request is built, so that's where a body that isn't JSON
   should be visible. If the header came from the route definition, reading the
   call wouldn't tell you how its body is sent. Responses mirror this: the
   route definition decides their content type, so a single one is a schema
   default there (edge case 3).
   - **Decode anything and let the schema decide**, as Elysia does. Rejected,
     because it gives up the CSRF protection.

2. **Raw or normalized header values.** A received header can be
   `text/csv; charset=utf-8` or `Text/CSV`:
   - `z.literal("text/csv")` in a request headers schema then rejects valid
     requests from clients that add a charset. On the client,
     `res.headers["content-type"] === "text/csv"` fails the same way.
   - Multipart makes this unavoidable, because its header always has a
     `boundary` parameter.
   - Codec selection normalizes internally either way. The question is what
     schemas and user code see. Raw values are plain HTTP. Normalized ones are
     friendlier but are no longer the header. Documenting
     `z.string().startsWith("text/csv")` is the cheap middle ground.

3. **Response header defaults, and the order around validation.** Response
   headers are validated as the handler wrote them, so a schema default such as
   `z.literal("text/csv").default("text/csv")` fills a missing `content-type`,
   and the handler never writes a single content type. The codec is then
   selected from the validated headers, which are also the ones sent. Only if
   `content-type` is still missing after validation does rest-rpc fall back to
   JSON. A schema that requires a `content-type` without a default makes the
   handler write it, and the types say so.

4. **Client types for unpaired unions.** `Jsonify<T>` (case 1) applied to a
   whole body union under a JSON header produces junk members. `Jsonify<Blob>`
   is `{}`, which almost anything is assignable to, so the union becomes
   effectively untyped. The rules that keep it honest:
   - **`respond()` call sites are paired.** In `respond(value, { headers })`,
     both types are known together. The JSON-safe check from case 1 runs per
     call, and on inferred routes, where the handler's return type is a union of
     paired `respond()` results, the client type can be exact.
   - **Declared unions are decoded per codec.** Under a JSON header, apply
     `Jsonify` only to body members that can be sent as JSON, without `Blob`,
     `Uint8Array` or streams. The per-call check means those can't reach the
     JSON codec anyway. `text/*` decodes to `string`, and anything else to
     `Blob`, whatever the body is.
   - **Never `{}`.** `Jsonify<Map>` and `Jsonify<Set>` are an empty-object type
     such as `Record<string, never>`, which is what `JSON.stringify` actually
     produces and doesn't swallow the rest of a union.

   Pin these with type tests against `JSON.parse(JSON.stringify(value))`.

5. **`FormData` (decided).** A `FormData` body is always sent as
   `multipart/form-data`, on the client and the server, and any `content-type`
   header is ignored. The boundary has to come from Fetch, so there's nothing
   to choose, and a header written by hand would only break it. It's the third
   inference exception, next to async iterables and `Response`. The types
   don't reject a `content-type` header next to a `FormData` body: ignoring it
   is harmless, because the boundary Fetch adds is always right. Sending a
   typed object as multipart is covered in
   [form bodies as objects](#form-bodies-as-objects), together with
   `URLSearchParams`.

6. **OpenAPI.** Content keys come from the `const` or `enum` of the converted
   headers schema, and `content-type` is removed from the documented header
   parameters, since OpenAPI ignores it there. Without a readable value, the
   content key is `*/*`.

### How this changes the other cases

| Case                              | With headers as the content type                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1. Native values in JSON          | Unchanged, plus the per-call JSON-safe check and the empty-object rule from edge case 4                            |
| 2. Binary bodies                  | The client body type comes from the header's type instead of a record key                                          |
| 3. Content type parameters        | Solved: the header carries parameters                                                                              |
| 4. Raw stream chunks              | An async iterable with a non-SSE `content-type` header is sent as raw chunks, restricted to `string \| Uint8Array` |
| 5. Content types known at runtime | Solved: the header is a string. Patterns come from the headers schema                                              |
| 6. Error format                   | Unaffected: the error format sets its own content type                                                             |
| 11. CORS                          | Allowed request headers include `content-type` only on routes that accept a body                                   |

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
- `Map` and `Set` become `{}`.
- `undefined` properties become optional or are dropped.

Optionally, make values that can't survive JSON at all, such as `bigint`, a type
error in the handler's return type for JSON responses. Then the server catches
the mistake instead of the client. With
[content types as headers](#content-types-as-headers), this check runs per
`respond()` call, where the value and the header are known together, and it also
rejects binary values sent without a header. `Map` and `Set` become an
empty-object type, never `{}`, so they don't swallow a union.

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

Derive the client body type from what the content type decodes to, not from
what the server sends:

| Content type                        | Client body type          |
| ----------------------------------- | ------------------------- |
| `application/json`, `+json`         | `Jsonify<T>` (see case 1) |
| `text/*`                            | `string`                  |
| `application/x-www-form-urlencoded` | `URLSearchParams`         |
| `multipart/form-data`               | `FormData`                |
| `text/event-stream`                 | stream of `Jsonify<item>` |
| anything else                       | `Blob`                    |

A declared schema for a binary type then describes only the server side. A
custom codec could declare the type it decodes to, so the client type follows
the codec instead of the table.

With [content types as headers](#content-types-as-headers), the table is keyed
by the type of the `content-type` header: the literal in a `respond()` call, or
the output of a declared headers schema. A header typed `string` decodes to
`Blob`, and a union is decoded per member, as edge case 4 there describes. The
two form rows change too: both types decode to objects with the query rules
([form bodies as objects](#form-bodies-as-objects)).

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

## 3. Content type parameters on declared routes

A declared response can't send a parameter such as `charset` without a custom
codec, even though inferred routes can.

```ts
const exportCsv = route
	.get("/todos/export")
	.response({ "text/csv": z.string() })
	.handler(({ respond }) =>
		respond(toCsv(todos), { contentType: "text/csv; charset=utf-8" }),
	);
// type error: '"text/csv; charset=utf-8"' is not assignable to type '"text/csv"'
```

Headers don't help, because a body's content type always replaces a
`content-type` header:

```ts
respond(toCsv(todos), {
	contentType: "text/csv",
	headers: { "content-type": "text/csv; charset=utf-8" }, // replaced
});
```

### Escape hatch

A custom codec that sets the full content type:

```ts
const csvUtf8 = bodyCodec("text/csv", {
	serialize: (value) =>
		serializedBody(String(value), {
			headers: { "content-type": "text/csv; charset=utf-8" },
		}),
});

createApp(routes, { bodyCodecs: [csvUtf8] });
```

This works, but it's server-wide configuration for a detail of one route, and it
changes every `text/csv` response.

### Fix sketch

Solved by [content types as headers](#content-types-as-headers): the header
carries its parameters, and the schema decides what it accepts, for example
`z.string().startsWith("text/csv")`. The sketch below is the alternative if the
current design is kept.

Let `contentType` in `respond()` on declared routes take a declared base type
plus parameters:

```ts
.response({ "text/csv": z.string() })
.handler(({ respond }) =>
	respond(toCsv(todos), { contentType: "text/csv; charset=utf-8" }),
);
```

- Types: ``K | `${K};${string}` `` for each declared media type `K`.
- Runtime: the base type selects the schema, and the full string goes to the
  codec and the header.
- The client type stays `"text/csv"`, as it already is for inferred routes.

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

- **Handler types:** for stream bodies under any content type other than
  `text/event-stream`, restrict the handler's return type to what can be sent:
  `AsyncIterable<string | Uint8Array> | ReadableStream<Uint8Array>`. This is the
  same rule `BodyValue` now applies to codecs, so the type error appears in the
  handler instead of a cut connection.
- **Client type:** follows case 2, so it's a `Blob`. It could become a
  `ReadableStream<Uint8Array>` if the client gets a streaming body mode later.
- **With [content types as headers](#content-types-as-headers):** an async
  iterable without a header is SSE, and one with any other `content-type`
  header is sent as raw chunks, with the same restriction.

## 5. Content types known only at runtime

A file whose type comes from upload metadata can't be sent with its real type on
a declared route.

```ts
const avatar = route
	.get("/users/:id/avatar")
	.response({
		"image/png": z.instanceof(Blob),
		"image/jpeg": z.instanceof(Blob),
	})
	.handler(async ({ params, respond }) => {
		const file = await storage.get(`avatars/${params.id}`); // Blob, type from the upload
		return respond(file, { contentType: file.type });
	});
// type error: 'string' is not assignable to type '"image/png"'
```

### Escape hatch

There are three options, each with a cost:

- **Cast:** `file.type as "image/png" | "image/jpeg"` compiles, but a `.webp`
  upload throws on the server because the media type isn't declared, and the
  client gets a `500`.
- **Declare only `application/octet-stream`:** everything is sent as
  octet-stream. Browsers usually sniff images anyway, but downloads lose their
  type, and the OpenAPI document says octet-stream.
- **Use an inferred route:** `respond(file, { contentType: file.type })` works,
  but there's no validation and no OpenAPI entry, and the client types
  `contentType` as `Lowercase<string>`.

### Fix sketch

Solved by [content types as headers](#content-types-as-headers): the handler
sets `content-type: file.type`, and a declared headers schema can accept a
pattern such as `z.templateLiteral(["image/", z.string()])`, with no rest-rpc
pattern feature. The sketch below is the alternative if the current design is
kept.

Allow media type patterns for binary responses, with the handler stating the
actual type:

```ts
.response({ "image/*": z.instanceof(Blob) })
.handler(async ({ params, respond }) => {
	const file = await storage.get(`avatars/${params.id}`);
	if (!isImageType(file.type)) throw errors.NOT_FOUND();
	return respond(file, { contentType: file.type }); // `image/${string}`
});
```

- Types: `image/${string}`. A helper type guard narrows a plain `string`.
- Runtime: the stated base type must match the pattern.
- OpenAPI: emits `image/*` as the content key, which OpenAPI allows.
- Client: the body is a `Blob` (case 2), and `contentType` is typed
  `image/${string}`.

The content type is still never taken from `blob.type` automatically. The
handler passes it deliberately, so the route still tells you what it can send.

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
    `cookies` sends as written.
- **What rest-rpc does:**
  - request validation runs before middleware, and its issues are sent to the
    caller, which is useful for clients but shows the schema shape to anyone;
  - response validation failures are hidden as `500` errors without details;
  - error `cause`s are never sent;
  - and anything else it guarantees.

## Summary

| Case                                   | Today                                                     | Fix sketch                                                    | New concept |
| -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| Content types as headers               | Content type is its own concept in five places            | Only a `content-type` header; JSON unless it says otherwise   | One fewer   |
| 1. Native values in JSON               | Client typed `Date`, receives `string`                    | `Jsonify<T>` client bodies                                    | No          |
| 2. Binary bodies                       | Client typed server's type, gets `Blob`                   | Client type from what the `content-type` header decodes to    | No          |
| 3. Content type parameters             | Type error, or a server-wide custom codec                 | Solved by content types as headers                            | No          |
| 4. Raw stream chunks                   | Compiles, connection cut at runtime                       | Restrict handler stream chunks to `string \| Uint8Array`      | No          |
| 5. Content types known only at runtime | Cast, octet-stream, or inferred route                     | Solved by content types as headers                            | No          |
| 6. Error response format               | Fixed JSON; rewrite responses on both ends                | Two-way `errorFormat` shared by server and client             | Yes         |
| 11. CORS                               | Wrap `fetch`; on Bun, every route                         | `cors` option, with methods and headers derived from routes   | Yes         |
| 13. Interceptors                       | Wrap `createApp` (and every Bun route) or replace `fetch` | One `intercept(request, next)` hook on the app and the client | Yes         |
| 14. Wildcard path params (maybe)       | Not supported                                             | `:path*` rest segment where routers support it                | Yes         |
