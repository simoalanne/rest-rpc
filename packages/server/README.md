# rest-rpc

REST APIs with RPC-like ergonomics: an HTTP route builder with sensible
defaults, and typed clients that call the routes like ordinary functions.
Schemas are any [Standard Schema](https://standardschema.dev) (Zod, Valibot,
ArkType). This is a compact cheatsheet of the whole API, and each section links
to the full [documentation](https://rest-rpc.vercel.app/docs/quickstart).

| Package                                                                         | Contains                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@rest-rpc/core`](https://npmx.dev/package/@rest-rpc/core)                     | Contracts, Fetch client, contract extraction, OpenAPI                           |
| [`@rest-rpc/server`](https://npmx.dev/package/@rest-rpc/server)                 | Route builder and handlers for Fetch runtimes, `@rest-rpc/server/node` for Node |
| [`@rest-rpc/tanstack-query`](https://npmx.dev/package/@rest-rpc/tanstack-query) | TanStack Query options and keys                                                 |

## Contents

- [Quickstart](#quickstart)
- [Route Builder](#route-builder)
  - [Methods, Paths and Prefixes](#methods-paths-and-prefixes)
  - [Request Segments, Reuse and Handler Arguments](#request-segments-reuse-and-handler-arguments)
  - [Responses](#responses)
  - [Static Responses](#static-responses)
  - [Errors](#errors)
  - [Content Types](#content-types)
  - [Type Helpers](#type-helpers)
- [Middleware, Context and Metadata](#middleware-context-and-metadata)
- [Server-Sent Events](#server-sent-events)
- [Contract-first](#contract-first)
- [HTTP Behavior](#http-behavior)
  - [Schemas and Validation](#schemas-and-validation)
  - [Serialization and Codecs](#serialization-and-codecs)
  - [Errors](#errors-1)
- [Server](#server)
  - [Serving Routes](#serving-routes)
  - [Fetch](#fetch)
  - [Node](#node)
  - [Framework Integration](#framework-integration)
- [Client](#client)
  - [Contract Extraction](#contract-extraction)
  - [Fetch Client](#fetch-client)
  - [Local Client](#local-client)
  - [TanStack Query](#tanstack-query)
- [OpenAPI](#openapi)

## [Quickstart](https://rest-rpc.vercel.app/docs/quickstart)

Responses are inferred from handler return values, so `.response()` is optional
and not needed for the common case. Define it for runtime validation or OpenAPI.

```ts routes.ts
import { route } from "@rest-rpc/server";
import { z } from "zod";

const todos = new Map<string, { id: string; title: string }>();

export const routes = {
	todos: {
		// No method: POST /todos/create, JSON body, 200 response.
		create: route.body(z.object({ title: z.string() })).handler(({ body }) => {
			const todo = { id: crypto.randomUUID(), title: body.title };
			todos.set(todo.id, todo);
			return todo; // the response type is inferred from the return value
		}),
		get: route
			.get("/todos/:id")
			.error("TODO_NOT_FOUND", { status: 404 })
			.handler(({ params, errors }) => {
				const todo = todos.get(params.id); // params: { id: string }
				if (!todo) throw errors.TODO_NOT_FOUND();
				return todo;
			}),
	},
};
```

```ts server.ts
import { createApp } from "@rest-rpc/server";

export default createApp(routes); // served by Bun, Deno and Workers as is
```

```ts client-contract.ts
import { extractContract } from "@rest-rpc/core";
import { routes } from "./routes";

// Bun-specific: a macro runs at bundle time and inlines the contract, so no
// server code ships. Other bundlers use the script under Contract Extraction.
export function getApi() {
	return extractContract(routes);
}
```

```ts client.ts
import { createClient } from "@rest-rpc/core";
import { getApi } from "./client-contract" with { type: "macro" };

const client = createClient(getApi(), { origin: "http://localhost:3000" });

// Calls resolve to an envelope { status, body, headers }, not the body.
const created = await client.todos.create({ body: { title: "Write docs" } });
const todo = await client.todos.get({ params: { id: created.body.id } });
console.log(todo.status, todo.body.title); // 200 "Write docs"

// An unknown id rejects with a RouteError { code: "TODO_NOT_FOUND", status: 404 }.
```

## [Route Builder](https://rest-rpc.vercel.app/docs/route-builder)

### [Methods, Paths and Prefixes](https://rest-rpc.vercel.app/docs/route-builder#choose-a-method-and-path)

```ts
// Without a path, the tree keys form it. Without a method, the route is a POST.
export const routes = {
	todos: {
		list: route.get().handler(listTodos), // GET /todos/list
		tags: { create: route.handler(createTag) }, // POST /todos/tags/create
		get: route.get("/todos/:id").handler(getTodo), // explicit, keys ignored
	},
};

// Prefixes are part of the contract, unlike createApp's mountPath.
route.prefix("/api/v1").get("/todos"); // GET /api/v1/todos
route.prefix("/api/v1").get(); // at todos.list: GET /api/v1/todos/list
```

### [Request Segments, Reuse and Handler Arguments](https://rest-rpc.vercel.app/docs/route-builder#handler-arguments)

```ts
// Every builder method returns a new value, so partial builders are shareable bases.
const authed = route
	.$context<{ user: User }>()
	.headers(z.object({ authorization: z.string() })) // lowercase names
	.openAPI({ tags: ["Todos"] }) // merged, tags combined
	.error("UNAUTHORIZED", { status: 401 });

const update = authed
	.patch("/todos/:id")
	.params(z.object({ id: z.coerce.number() })) // must cover every path param
	.query(z.object({ notify: z.enum(["yes", "no"]).optional() }))
	.body(z.object({ title: z.string() })) // not available on GET
	.body(z.object({ done: z.boolean() })) // stacked schemas merge their outputs
	.handler(
		({
			params, // { id: number } from the path, { id: string } without .params()
			query, // { notify?: "yes" | "no" } from the query string
			headers, // { authorization: string } from the base
			body, // { title: string; done: boolean } from the request body
			context, // readonly: initial values from the host, plus values middleware injects
			errors, // defined errors, created without new: throw errors.UNAUTHORIZED()
			respond, // respond(), limited to the defined statuses
			route, // the definition: method, path, meta
			signal, // aborts when the client disconnects
		}) => updateTodo(params.id, body),
	);
```

### [Responses](https://rest-rpc.vercel.app/docs/route-builder#return-responses)

```ts
import { respond } from "@rest-rpc/server"; // for code outside handlers and middleware

// Inferred: a plain value is a 200 JSON body, of any shape.
route.handler(() => todo);
route.handler(() => {}); // 200 without a body
// respond() sets anything else. Only its results are read as responses.
route.handler(({ respond }) =>
	respond("Created", {
		status: 201, // 2xx, defaults to 200
		headers: { "content-type": "text/plain", location: "/todos/1" }, // JSON without one
		cookies: ["session=abc; HttpOnly"], // each its own Set-Cookie header
	}),
);
// A Fetch Response is sent as it is, and the client result is loosely typed.
route.handler(
	() => new Response(xml, { headers: { "content-type": "application/xml" } }),
);
route.handler(() => Response.redirect(signedUrl, 302)); // the client follows it
route.response(raw()).handler(() => new Response(xml)); // declared, as in contracts

// Defined: runtime-validated, typed, and included in OpenAPI.
route
	.response(todoSchema) // 200 JSON
	.response(todoSchema, {
		status: 201, // 201-299, each status defined once
		headers: z.object({ location: z.string() }),
		description: "Created", // OpenAPI
	})
	.response({ status: 204 }); // bodyless

// A plain value is the body of the only defined response. respond() may omit
// the only status, or 200 among several.
route.response(todoSchema, { status: 201 }).handler(() => todo); // 201
const created = (todo: Todo) => respond(todo, { status: 201 }); // outside a handler
```

### [Static Responses](https://rest-rpc.vercel.app/docs/route-builder#static-responses)

```ts
// The same response for every request, serialized once. Not on routes that
// read the request or run middleware.
route.get("/health").static({ ok: true });
route
	.get("/robots.txt")
	.static(
		respond("User-agent: *", { headers: { "content-type": "text/plain" } }),
	);
```

### [Errors](https://rest-rpc.vercel.app/docs/route-builder#define-errors)

```ts
import { routeError } from "@rest-rpc/server";

route
	.get("/todos/:id")
	.error("TODO_NOT_FOUND", {
		status: 404, // 400-599, defaults to 400
		data: z.object({ id: z.string() }),
		headers: z.object({ "x-reason": z.string() }),
		message: "Todo not found", // defaults to the code
		description: "No todo has this id", // OpenAPI
	})
	.handler(({ params, errors }) => {
		throw errors.TODO_NOT_FOUND({
			data: { id: params.id }, // required when defined
			headers: { "x-reason": "deleted" }, // required when defined
			cookies: ["session=; Max-Age=0"], // each its own Set-Cookie header
			message: "Deleted", // overrides the defined message
			cause, // never sent
		});
	});

// Define once, throw from any code, add to routes with .error(TodoNotFound).
export const TodoNotFound = routeError("TODO_NOT_FOUND", { status: 404 });
```

Errors are sent as JSON `{ code, message, data? }`, and clients reject with
them. Errors under HTTP Behavior lists every failure and what each side gets.

### [Content Types](https://rest-rpc.vercel.app/docs/route-builder#content-types)

```ts
// A body is JSON unless a content-type header says otherwise.
route
	.post("/todos/import")
	// The content types the route accepts. Others are answered with 415.
	.headers(z.object({ "content-type": z.literal("text/csv") })) // without parameters
	.body(z.string())
	.handler(({ body }) => save(parseCsv(body)));
await client.todos.import({
	headers: { "content-type": "text/csv" },
	body: csv,
});

// A declared response states its own in the headers schema. A default sends it.
route
	.get("/todos/export")
	.response(z.string(), {
		headers: z.object({
			"content-type": z.literal("text/csv").default("text/csv"),
		}),
	})
	.handler(() => toCsv(todos));
```

### [Type Helpers](https://rest-rpc.vercel.app/docs/route-builder#type-helpers)

```ts
import type {
	InferServerHandler,
	InferServerRequest,
	InferServerResponse,
} from "@rest-rpc/server";

// Infer from a route without .handler() (or a contract route), then attach it.
const definition = route.get("/todos/:id").response(todoSchema);

type GetRequest = InferServerRequest<typeof definition>; // handler argument: { params, ..., context, signal }
type GetResponse = InferServerResponse<typeof definition>; // body or respond() results
const getTodo: InferServerHandler<typeof definition> = ({ params }) =>
	findTodo(params.id);
export const get = definition.handler(getTodo);

type Requests = InferServerRequest<typeof routes>; // a tree infers a tree of types
```

## [Middleware, Context and Metadata](https://rest-rpc.vercel.app/docs/middleware)

Middleware is onion-style and runs after request validation: each `.use()`
wraps every middleware defined after it, with the handler innermost. Code
before `await next()` runs outermost first, code after it innermost first.
Middleware returns the response of `next()`, or a `respond()` result to
short-circuit, and throws defined errors for failures.

```ts
const timed = route.use(async ({ next }) => {
	const started = performance.now();
	try {
		return await next(); // the downstream response: { status, body, headers }
	} finally {
		console.log(performance.now() - started);
	}
});

// Ends the chain without the handler. An object of the same shape works too.
const paused = route
	.response(todoSchema)
	.response({ status: 204 })
	.use(async ({ respond, next }) =>
		isPaused() ? respond(undefined, { status: 204 }) : next(),
	);

// $context<T>() declares initial context the host provides. createApp, handle()
// and call() require it, for every route in the tree.
const Unauthorized = routeError("UNAUTHORIZED", { status: 401 });
const authenticated = route
	.$context<{ db: Db }>()
	.headers(z.object({ authorization: z.string() }))
	.error(Unauthorized);

// Reusable, typed by its builder and usable on routes with matching request,
// errors and metadata. Context it reads and a route lacks becomes the route's
// initial context. route.middleware<{ headers: ... }>() requires fields by type.
const attachUser = authenticated.middleware(
	async ({ headers, errors, context, next }) => {
		const user = await authenticate(context.db, headers.authorization);
		if (!user) throw errors.UNAUTHORIZED();
		return next({ context: { user } }); // typed for later middleware and the handler
	},
);

const profile = authenticated
	.use(attachUser)
	.handler(({ context }) => context.user);

createApp({ profile }, { context: (request) => ({ db }) }); // required: db

// Metadata describes a route to shared code. .meta() exists once $meta<T>()
// declares a shape, and only accepts values of it.
const app = route.$meta<{ access: "public" | "signed-in" | Permission }>();

// Reusable and earlier inline middleware read route.meta as Partial<T> | undefined.
const authorize = app.middleware(({ route, next }) => {
	const access = route.meta?.access ?? "signed-in";
	if (access !== "public") checkAccess(access); // throws a defined error
	return next();
});

app.use(authorize).get("/health").meta({ access: "public" }); // shallow-merged

declare module "@rest-rpc/server" {
	interface DefaultContext {
		env: { DATABASE_URL: string }; // required for every route, with $context<T>()
	}
	interface DefaultMeta {
		access: "public" | "signed-in" | Permission; // merged with $meta<T>()
	}
}
```

## [Server-Sent Events](https://rest-rpc.vercel.app/docs/streaming)

```ts
import { sse, sseEvent, sseFormat } from "@rest-rpc/server";

const events = route
	.get("/todos/events")
	.headers(z.object({ "last-event-id": z.string().optional() })) // resume manually
	.response(sse(z.object({ message: z.string() }))) // optional, validates each item
	.handler(async function* ({ headers, signal }) {
		yield { message: "Created" }; // plain data
		yield sseEvent(
			{ message: "Done" },
			{
				id: "2", // what clients resume from
				event: "todo.updated",
				retry: 2_000,
			},
		);
		while (!signal.aborted) yield await nextEvent({ signal });
	});

// Optional: the same data format on both ends, JSON by default
const superjsonEvents = sseFormat({
	serialize: (data) => superjson.stringify(data),
	deserialize: (data) => superjson.parse(data),
});
createApp(routes, {
	sse: {
		format: superjsonEvents,
		keepAlive: 15_000, // ": keepalive" comment after 15 s without an event
		initialComment: true, // ": ok" comment right after the headers
	},
});
createClient(api, { origin, sse: { format: superjsonEvents } });
respond(stream, { sse: { keepAlive: 5_000 } }); // per stream
```

## [Contract-first](https://rest-rpc.vercel.app/docs/contract-first)

A contract has no handlers to infer from, so every successful response must be
defined with `.response()`. Clients take the contract
directly, without extraction, and `validateResponses` can use its schemas.

```ts contract.ts
import { route } from "@rest-rpc/core"; // same builder, no handlers

export const api = {
	todos: {
		get: route
			.get("/todos/:id")
			.response(todoSchema)
			.error("TODO_NOT_FOUND", { status: 404 }),
		create: route.body(newTodoSchema).response(todoSchema),
	},
};
```

```ts server.ts
import { implement } from "@rest-rpc/server";

// Implement one contract route, with its own $context<T>() and .use() if needed...
const get = implement(api.todos.get).handler(({ params }) =>
	findTodo(params.id),
);

// ...or implement a contract tree to share context and middleware with every
// route in it. `use`/`$context` are reserved top-level keys.
const todos = implement(api.todos).$context<{ db: Db }>().use(attachUser);
export const routes = {
	todos: {
		get: todos.get.handler(({ params }) => findTodo(params.id)),
		create: todos.create.handler(({ body, context }) =>
			createTodo(body, context.user),
		),
	},
};
```

## HTTP Behavior

### [Schemas and Validation](https://rest-rpc.vercel.app/docs/http-behavior/schemas)

```ts
import { type } from "@rest-rpc/server";

route.body(type<{ title: string }>()); // types only, no runtime validation
type((input: number) => input.toString()); // with a (possibly async) mapping

// Skips schema validation only: types, OpenAPI and decoding are unaffected.
createApp(routes, {
	disableRequestValidation: true,
	disableResponseValidation: true,
});
```

Clients send schema input and handlers receive schema output. What each
definition guarantees at runtime:

| Definition        | Server                               | Fetch client                                                             | OpenAPI                     |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------ | --------------------------- |
| Request schemas   | Validated before middleware, or 400  | Not validated                                                            | Parameters and request body |
| Inferred response | Not validated                        | Types only, any 2xx resolves                                             | Placeholder `default`       |
| `.response()`     | Validated, or 500                    | Status and stream checked; body and headers with `validateResponses` (1) | Documented                  |
| `.error()`        | `data` and headers validated, or 500 | Code and status recognized; `data` with `validateResponses` (1)          | Documented                  |
| `type<T>()`       | Types only                           | Types only                                                               | Empty schema                |

(1) `validateResponses` needs a shared contract. An extracted contract has no
schemas, so the option has no effect.

### [Serialization and Codecs](https://rest-rpc.vercel.app/docs/http-behavior/serialization)

| Location / media type               | Encoding                                                    |
| ----------------------------------- | ----------------------------------------------------------- |
| Params, headers                     | Strings; schemas coerce (`z.coerce.number()`)               |
| Query                               | `key=value`, arrays as `key[]=a&key[]=b`, no nested objects |
| `application/json`, `+json`         | JSON value                                                  |
| `application/x-www-form-urlencoded` | `URLSearchParams`                                           |
| `multipart/form-data`               | `FormData`                                                  |
| `text/*`                            | `string`                                                    |
| Other                               | `Blob` or `Uint8Array` sent, `Blob` received                |

```ts
import { bodyCodec } from "@rest-rpc/core";

// Same codec works on the client and both server runtimes; pass it as `bodyCodecs`.
const binary = bodyCodec("application/octet-stream", {
	serialize: (value, contentType) => value as Uint8Array, // full content type, with params
	// body: text(), json(), arrayBuffer(), blob() or the body stream; not a Request on Node
	deserialize: async (body, contentType) =>
		new Uint8Array(await body.arrayBuffer()),
});
```

### [Errors](https://rest-rpc.vercel.app/docs/http-behavior/errors)

| What happens                                       | Server sends                                                                     | Fetch client gets                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------- |
| A defined error is thrown                          | Its status, with validated `data` and headers                                    | Typed `RouteError`, `isDefinedError()` is true |
| A `RouteError` the route does not define is thrown | Its own status, `data` and headers, unvalidated                                  | Untyped `RouteError`                           |
| Any other error is thrown                          | `INTERNAL_SERVER_ERROR` 500 with `createApp`, otherwise the framework handles it | Untyped `RouteError` with `createApp`          |
| Request validation fails                           | `REQUEST_VALIDATION_FAILED` 400, issues per segment as `data`                    | Untyped `RouteError` (2)                       |
| The request body cannot be decoded                 | `MALFORMED_REQUEST_BODY` 400                                                     | Untyped `RouteError` (2)                       |
| The `content-type` is not one the route declares   | `UNSUPPORTED_MEDIA_TYPE` 415                                                     | Untyped `RouteError` (2)                       |
| A response or error `data` fails validation        | `INTERNAL_SERVER_ERROR` 500, without details                                     | Untyped `RouteError` (2)                       |
| No route matches (`createApp`)                     | `NOT_FOUND` 404                                                                  | Untyped `RouteError` (2)                       |
| A response breaks the contract                     | -                                                                                | Plain `Error`, details in `cause`              |
| An error response is not from rest-rpc             | -                                                                                | Plain `Error`, the response in `cause`         |
| There is no response (network, timeout, abort)     | -                                                                                | The original error                             |

(2) Typed when the route adds the built-in error's definition:

```ts
import { RequestValidationFailed } from "@rest-rpc/server";

route.body(todoInput).error(RequestValidationFailed); // types its issues as `data`
// Also exported: MalformedRequestBody, UnsupportedMediaType, InternalServerError, NotFound
```

Errors are JSON `{ code, message, data? }` by default. An error format changes that for the
server, the client and OpenAPI, built-in errors included:

```ts
import { errorFormat } from "@rest-rpc/server";

const problemJson = errorFormat({
	contentType: "application/problem+json", // its body codec encodes the body
	serialize: ({ code, status, message, data }) => ({
		title: message,
		status,
		code,
		data,
	}),
	// The code, message and data of a body, or undefined to reject with a plain Error.
	deserialize: (body, { status, headers }) =>
		isProblem(body)
			? { code: body.code, message: body.title, data: body.data }
			: undefined,
	openAPI: ({ code, status, data }) => problemSchema(code, data), // optional
});
createApp(routes, { errorFormat: problemJson }); // also createClient, createOpenApiDocument
```

## Server

### [Serving Routes](https://rest-rpc.vercel.app/docs/server/overview)

```ts
// The same functions from @rest-rpc/server (Fetch) and @rest-rpc/server/node (Node),
// from most to least of each request handled by rest-rpc:
createApp(routes, options); // routes, 404s and thrown errors: the handler the runtime calls
createCatchAllHandler(routes, options); // routes under one framework route, unmatched fall through
createRouteHandlers(routes, options); // one route per rest-rpc route for the framework's router
// Thrown errors reject from the last two, for the framework to handle.
```

### [Fetch](https://rest-rpc.vercel.app/docs/server/fetch)

```ts
import { createApp, interceptor } from "@rest-rpc/server";

export default createApp(routes, {
	mountPath: "/api", // served under, not part of route paths (use .prefix() for that)
	context: (request, env: Env) => ({ db: env.DB }), // extra fetch args, e.g. Workers env
	notFound: (request) => new Response("Not found", { status: 404 }),
	onError: (error, request) =>
		error.status >= 500 && console.error(error.cause),
	bodyCodecs: [binary], // also errorFormat, disableRequestValidation, disableResponseValidation
	interceptors: [cors, apiKey], // run first to last around everything
});

// Every request, unmatched ones and OPTIONS included, except .static() routes.
// Bun's app.routes run them too.
const apiKey = interceptor(({ request, next, route }) =>
	route?.meta?.access === "public" || // route is undefined when none matches
	request.headers.get("x-api-key") === API_KEY
		? next() // or next(request) to continue with another request, also more than once
		: new Response("Forbidden", { status: 403 }),
);

// app.routes is routed by Bun's native router. Bun server options:
const app = createApp(routes);
Bun.serve({
	...app,
	port: 8080,
	routes: { ...app.routes, "/ping": new Response("ok") },
});
```

### [Node](https://rest-rpc.vercel.app/docs/server/node)

```ts
import { createServer } from "node:http";
import { createApp, interceptor } from "@rest-rpc/server/node";

// A request listener with the same options, but Node's request in context and notFound.
const app = createApp(routes, {
	context: (req) => ({ user: req.headers.authorization }),
	notFound: (req, res) => void res.writeHead(404).end(), // writing nothing keeps NOT_FOUND
	// From @rest-rpc/server/node, with { request, response, next, route }.
	// Headers set before next() are on every response.
	interceptors: [
		interceptor(({ request, response, next }) => {
			response.setHeader("access-control-allow-origin", "*");
			return request.method === "OPTIONS"
				? void response.writeHead(204).end()
				: next();
		}),
	],
});
const server = createServer(app).listen(3000);
process.on("SIGTERM", () => server.close());
```

### [Framework Integration](https://rest-rpc.vercel.app/docs/server/framework-integration)

```ts
// Native router, Express: one framework route per rest-rpc route.
// Node frameworks import from @rest-rpc/server/node, Fetch ones from @rest-rpc/server.
import { createRouteHandlers } from "@rest-rpc/server/node";

for (const r of createRouteHandlers(routes)) {
	app[r.method.toLowerCase()](r.path, (req, res, next) => {
		r.handle(req, res, {
			context: { user: req.user }, // seeds the request context
			params: req.params, // already matched
			body: req.body, // already parsed, still validated
		}).catch(next); // other errors go to the framework
	});
}
```

```ts
// Catch-all, Hono: rest-rpc routes under one mount, unmatched requests fall through.
import { createCatchAllHandler } from "@rest-rpc/server";

const handler = createCatchAllHandler(routes); // also takes the route options
app.all("/api/*", async (c) => {
	const result = await handler(c.req.raw, {
		mountPath: "/api",
		context: { user: c.var.user },
	});
	return result.matched ? result.response : c.notFound();
});
```

## Client

### [Contract Extraction](https://rest-rpc.vercel.app/docs/client/contract-extraction)

```ts scripts/extract-contract.ts
// Build time: keeps methods, paths, statuses and error codes, no schemas.
await writeFile("contract.json", JSON.stringify(extractContract(routes)));
```

```ts client-contract.ts
// Browser code imports only @rest-rpc/core, this module and the JSON file.
import type { routes } from "../server/routes"; // type-only, erased from the bundle
import contract from "./contract.json";

export const api = contract as unknown as typeof routes;
```

### [Fetch Client](https://rest-rpc.vercel.app/docs/client/fetch-client)

```ts
import {
	clientInterceptor,
	createClient,
	isDefinedError,
	RouteError,
	safe,
} from "@rest-rpc/core";

const client = createClient(api, {
	origin: "https://api.example.com", // browsers default to the page's origin
	mountPath: "/api", // the server's mountPath
	globalHeaders: { authorization: () => `Bearer ${readToken()}` }, // static or per request
	timeoutMs: 10_000,
	fetchOptions: { credentials: "include" },
	fetch: customFetch, // (request: Request) => Promise<Response>, such as app.fetch
	validateResponses: true, // shared contracts only
	errorFormat: problemJson, // the server's, JSON { code, message, data? } by default
	interceptors: [refreshOn401], // first to last around each exchange, before decoding
});

const refreshOn401 = clientInterceptor(async ({ request, next, route }) => {
	const response = await next(request.clone()); // next() may be called more than once
	if (response.status !== 401 || route.meta?.access === "public")
		return response;
	request.headers.set("authorization", `Bearer ${await refreshToken()}`);
	return next(request);
});

// Resolves to a status-discriminated { status, body, headers, cookies }.
// cookies are the Set-Cookie values, which browsers hide, so empty there.
const res = await client.todos.get(
	{ params: { id: "1" } },
	{ signal, cache: "no-store", additionalHeaders: { "x-trace-id": traceId } },
);
await client.todos.import({
	headers: { "content-type": "text/csv" },
	body: csv,
});
await client.health(undefined, { cache: "no-store" }); // options without input

// Errors: reject by default, or resolve to { error } | { data } with safe().
const { error, data } = await safe(client.todos.get({ params: { id: "1" } }));
if (isDefinedError(error) && error.code === "TODO_NOT_FOUND") {
	console.log(error.data);
} else if (error instanceof RouteError) {
	console.log(error.status, error.code); // not defined by the route
} else if (error) {
	throw error; // network, contract violation, non rest-rpc error
} else {
	console.log(data.body);
}

// Streams: async iterable of { data, id?, event?, retry? }, no auto-reconnect.
const stream = await client.todos.events(undefined, {
	additionalHeaders: { "last-event-id": lastId },
});
if (stream.status === 200) {
	for await (const { data, id, event, retry } of stream.body) console.log(data);
}
```

```ts
import type {
	ApiClientFor,
	ClientPromise,
	InferClientError,
	InferClientRequest,
	InferClientResponse,
	InferClientStreamData,
} from "@rest-rpc/core";

type Get = typeof client.todos.get; // a client route function
type GetRequest = InferClientRequest<Get>; // globalHeaders already optional
type GetResponse = InferClientResponse<Get>; // every response envelope
type GetError = InferClientError<Get>; // defined errors
type TodoEvent = InferClientStreamData<typeof client.todos.events>; // event data
type Responses = InferClientResponse<typeof client>; // a tree infers a tree of types
// Without a client, pass a route and the globalHeaders type instead.
type RouteRequest = InferClientRequest<
	typeof api.todos.get,
	typeof globalHeaders
>;
type Client = ApiClientFor<typeof api>;

// Return calls directly with ClientPromise to keep the error type for safe().
const getTodo = (id: string): ClientPromise<GetResponse, GetError> =>
	client.todos.get({ params: { id } });
```

### [Local Client](https://rest-rpc.vercel.app/docs/client/local-client)

```ts
import { call, createLocalClient } from "@rest-rpc/server";

// In-process: validation, middleware and handler, no HTTP encoding.
// Same request and result as a Fetch client call, and rejects the same way.
const res = await call(getTodo, { params: { id: "1" } }, { context, signal });
const local = createLocalClient(routes); // mirrors the route tree
await local.todos.create(
	{ body: { title: "Write docs" } },
	{ context, signal },
);
```

### [TanStack Query](https://rest-rpc.vercel.app/docs/client/tanstack-query)

```ts
import { createTanstackQueryUtils } from "@rest-rpc/tanstack-query";
import { skipToken } from "@tanstack/query-core";

const restrpc = createTanstackQueryUtils(createClient(api, { origin })); // or createLocalClient(routes)

useQuery(
	restrpc.todos.get.queryOptions({
		request: id ? { params: { id } } : skipToken,
		fetchOptions: { cache: "no-store", additionalHeaders }, // per-call options
		queryKey: ["todos", "detail", id], // optional custom key
		select: (res) => res.body, // data is the response envelope
		staleTime: 60_000, // any other TanStack Query option
	}),
);
useInfiniteQuery(
	restrpc.todos.page.infiniteQueryOptions({
		request: (cursor: string | undefined) => ({ query: { cursor } }),
		initialPageParam: undefined,
		getNextPageParam: (last) => last.body.nextCursor,
	}),
);
useQuery(
	restrpc.todos.events.streamedQueryOptions({
		initialValue: "", // defaults to an array of events
		reducer: (text, event) => text + event.data.message,
	}),
);
const create = useMutation(
	restrpc.todos.create.mutationOptions({
		onError: (error) => isDefinedError(error) && toast(error.message),
	}),
);
create.mutate({ body: { title: "Write docs" } });

restrpc.todos.get.queryKey({ params: { id: "1" } }); // ["todos", "get", { params: { id: "1" } }]
restrpc.todos.get.queryKey(); // prefix matching every todos.get query of any kind
restrpc.todos.page.infiniteQueryKey(request); // ["todos", "page", "~infinite", request], request of the initial page
restrpc.todos.events.streamedQueryKey(); // ["todos", "events", "~streamed"]
restrpc.todos.create.mutationKey(); // ["todos", "create"]
```

## [OpenAPI](https://rest-rpc.vercel.app/docs/openapi)

```ts
import { createOpenApiDocument } from "@rest-rpc/server"; // or @rest-rpc/core for contracts

// Only defined .response() schemas are documented.
const document = createOpenApiDocument(routes, {
	info: { title: "Todo API", version: "1.0.0" },
	servers: [{ url: "https://api.example.com" }], // also components, tags, errorFormat
	// Without a converter, schemas are emitted as empty Schema Objects.
	schemaConverter: (schema, mode) =>
		z.toJSONSchema(schema as z.ZodType, { io: mode }),
	transformOperation: ({ route, routePath, operation }) => ({
		...operation,
		operationId: routePath.join("."),
	}),
});

// Operation details, merged across calls. Responses and errors take `description`.
route.openAPI({
	summary: "List todos",
	description: "Lists todos of the current user.",
	operationId: "listTodos",
	tags: ["Todos"],
	deprecated: false,
	security: [{ bearerAuth: [] }],
	externalDocs: { url: "https://example.com/docs" },
	extensions: { "x-internal": true },
});
```
