# rest-rpc

REST APIs with RPC-like ergonomics: an HTTP route builder with sensible
defaults, and typed clients that call the routes like ordinary functions.
Schemas are any [Standard Schema](https://standardschema.dev) (Zod, Valibot,
ArkType). Below are the common patterns, each a complete example. See the
[documentation](https://rest-rpc.vercel.app/docs/quickstart) for the rest.
For agents, [llms.txt](https://rest-rpc.vercel.app/llms.txt) lists every
docs page and the ways to fetch them.

| Package                                                                         | Contains                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@rest-rpc/core`](https://npmx.dev/package/@rest-rpc/core)                     | Contracts, Fetch client, contract extraction, OpenAPI                           |
| [`@rest-rpc/server`](https://npmx.dev/package/@rest-rpc/server)                 | Route builder and handlers for Fetch runtimes, `@rest-rpc/server/node` for Node |
| [`@rest-rpc/tanstack-query`](https://npmx.dev/package/@rest-rpc/tanstack-query) | TanStack Query options and keys                                                 |

Server code, its tests included, imports from `@rest-rpc/server`, which
re-exports what it needs from `@rest-rpc/core`. Client code imports
`@rest-rpc/core`.

## Contents

- [Hello World](#hello-world)
- [Methods and Paths](#methods-and-paths)
- [Request Validation](#request-validation)
- [Status, Headers and Cookies](#status-headers-and-cookies)
- [Defined Responses](#defined-responses)
- [Errors](#errors)
- [Shared Errors](#shared-errors)
- [Middleware, Context and Metadata](#middleware-context-and-metadata)
- [Server-Sent Events](#server-sent-events)
- [Content Types](#content-types)
- [Codecs](#codecs)
- [Raw and Static Responses](#raw-and-static-responses)
- [Interceptors](#interceptors)
- [Node](#node)
- [Frameworks](#frameworks)
- [Browser Clients](#browser-clients)
- [Client Options](#client-options)
- [TanStack Query](#tanstack-query)
- [Contract-first](#contract-first)
- [Local Calls](#local-calls)
- [OpenAPI](#openapi)
- [Type Helpers](#type-helpers)

## Hello World

A route, an app and a typed client. The client here calls the app in the same
process, which is also how to test it.

See [Quickstart](https://rest-rpc.vercel.app/docs/quickstart)

```ts
import { createApp, createClient, route } from "@rest-rpc/server";

const routes = {
	hello: route.get("/hello").handler(() => ({ message: "Hello" })),
};

const app = createApp(routes); // `export default app` to serve it on Bun, Deno or Workers

const client = createClient(routes, {
	origin: "http://localhost",
	fetch: app.fetch,
});
const { status, body } = await client.hello();
console.log(status, body.message); // 200 "Hello", typed from the handler
```

## Methods and Paths

A route without a method is a `POST` at its keys in the route tree. `:name`
segments are string params.

See [Route Builder](https://rest-rpc.vercel.app/docs/route-builder#choose-a-method-and-path)

```ts
import { route } from "@rest-rpc/server";
import { z } from "zod";

const api = route.prefix("/api");

export const routes = {
	posts: {
		list: api
			.get("/posts")
			.handler(() => [{ id: "1", title: "Hello", body: "First post" }]), // GET /api/posts
		get: api.get("/posts/:id").handler(({ params }) => ({ id: params.id })), // params.id: string
		create: api
			.body(z.object({ title: z.string(), body: z.string() }))
			.handler(({ body }) => ({ id: "2", title: body.title, body: body.body })), // POST /api/posts/create
	},
};
```

## Request Validation

Params, query, headers and body are validated before the handler runs, and an
invalid request gets a `400`. Params, query and headers arrive as strings, so
their schemas coerce.

See [Validation](https://rest-rpc.vercel.app/docs/http-behavior/validation)

```ts
import { route } from "@rest-rpc/server";
import { z } from "zod";

const search = route
	.get("/users/:id/posts")
	.params(z.object({ id: z.coerce.number() }))
	.query(
		z.object({
			sort: z.enum(["new", "top"]).optional(),
			tags: z.array(z.string()).optional(),
		}),
	)
	.headers(z.object({ "x-request-id": z.string() }))
	.handler(({ params, query, headers }) => ({
		userId: params.id, // number
		sort: query.sort ?? "new",
		tags: query.tags ?? [], // sent as tags[]=a&tags[]=b
		requestId: headers["x-request-id"],
	}));
```

## Status, Headers and Cookies

Return the body, or `respond()` to set the rest of the response. The client
receives them with lowercase header names.

See [Return Responses](https://rest-rpc.vercel.app/docs/route-builder#return-responses)

```ts
import { createApp, createClient, route } from "@rest-rpc/server";
import { z } from "zod";

const create = route
	.post("/posts")
	.body(z.object({ title: z.string(), body: z.string() }))
	.handler(({ body, respond }) => {
		const post = {
			id: crypto.randomUUID(),
			title: body.title,
			body: body.body,
		};
		return respond(post, {
			status: 201,
			headers: { location: `/posts/${post.id}` },
			cookies: ["draft=; Max-Age=0"],
		});
	});

const app = createApp({ create });
const client = createClient(
	{ create },
	{
		origin: "http://localhost",
		fetch: app.fetch,
	},
);

const { status, headers } = await client.create({
	body: { title: "Hello", body: "First post" },
});
console.log(status, headers.location); // 201 "/posts/..."
```

## Defined Responses

Responses are inferred from the handler. Define them to validate them at
runtime and document them in OpenAPI.

See [Define Responses](https://rest-rpc.vercel.app/docs/route-builder#define-responses)

```ts
import { route } from "@rest-rpc/server";
import { z } from "zod";

const post = z.object({ id: z.string(), title: z.string(), body: z.string() });

const create = route
	.post("/posts")
	.body(z.object({ title: z.string(), body: z.string() }))
	.response(post, { status: 201, headers: z.object({ location: z.string() }) })
	.handler(({ body, respond }) => {
		const created = {
			id: crypto.randomUUID(),
			title: body.title,
			body: body.body,
		};
		return respond(created, {
			status: 201,
			headers: { location: `/posts/${created.id}` },
		});
	});
```

## Errors

Errors are thrown. A defined error is typed on the client, and any other
`RouteError` is still sent with its status.

See [Errors](https://rest-rpc.vercel.app/docs/http-behavior/errors)

```ts
import {
	createApp,
	createClient,
	isDefinedError,
	route,
	safe,
} from "@rest-rpc/server";
import { z } from "zod";

const posts = new Map([["1", { id: "1", title: "Hello", body: "First post" }]]);

const routes = {
	get: route
		.get("/posts/:id")
		.error("POST_NOT_FOUND", {
			status: 404,
			data: z.object({ id: z.string() }),
		})
		.handler(({ params, errors }) => {
			const post = posts.get(params.id);
			if (!post) throw errors.POST_NOT_FOUND({ data: { id: params.id } });
			return post;
		}),
};

const app = createApp(routes);
const client = createClient(routes, {
	origin: "http://localhost",
	fetch: app.fetch,
});

const { error, data } = await safe(client.get({ params: { id: "2" } }));
if (isDefinedError(error)) console.log(error.code, error.data.id); // "POST_NOT_FOUND" "2"
else if (error) throw error;
else console.log(data.body.title);
```

## Shared Errors

`routeError()` defines an error once, to throw it from any code and add it to
routes.

See [Define Errors](https://rest-rpc.vercel.app/docs/route-builder#define-errors)

```ts
import { route, routeError } from "@rest-rpc/server";
import { z } from "zod";

const PostNotFound = routeError("POST_NOT_FOUND", {
	status: 404,
	data: z.object({ id: z.string() }),
});

const posts = new Map([["1", { id: "1", title: "Hello", body: "First post" }]]);

const findPost = (id: string) => {
	const post = posts.get(id);
	if (!post) throw new PostNotFound({ data: { id } });
	return post;
};

const get = route
	.get("/posts/:id")
	.error(PostNotFound)
	.handler(({ params }) => findPost(params.id));
```

## Middleware, Context and Metadata

Middleware runs after validation, around the handler, and passes typed values
to it through context. Initial context comes from the host, and routes describe
themselves to shared middleware with metadata of a declared shape.

See [Middleware](https://rest-rpc.vercel.app/docs/middleware)

```ts
import { createApp, route } from "@rest-rpc/server";

const base = route
	.$meta<{ access: "public" | "signed-in" }>()
	.$context<{ headers: Headers }>() // provided by the app below
	.error("UNAUTHORIZED", { status: 401 })
	.use(({ route, context, errors, next }) => {
		const user = context.headers.get("authorization");
		if (!user && route.meta?.access !== "public") throw errors.UNAUTHORIZED();
		return next({ context: { user } });
	});

const routes = {
	health: base
		.get("/health")
		.meta({ access: "public" })
		.handler(() => "ok"),
	me: base
		.get("/me")
		.meta({ access: "signed-in" })
		.handler(({ context }) => context.user), // string | null
};

export default createApp(routes, {
	context: (request) => ({ headers: request.headers }), // or an object, such as { db }
});
```

## Server-Sent Events

Return an async iterable to stream events. The client iterates them.

See [Server-Sent Events](https://rest-rpc.vercel.app/docs/server-sent-events)

```ts
import {
	createApp,
	createClient,
	route,
	sse,
	sseEvent,
} from "@rest-rpc/server";
import { z } from "zod";

const messages = ["Ada liked your post", "Grace commented on your post"];

const routes = {
	notifications: route
		.get("/notifications")
		.response(sse(z.object({ message: z.string() }))) // optional, validates each event
		.handler(async function* ({ signal }) {
			for (const [i, message] of messages.entries()) {
				if (signal.aborted) break;
				yield sseEvent({ message }, { id: String(i) });
			}
		}),
};

const app = createApp(routes);
const client = createClient(routes, {
	origin: "http://localhost",
	fetch: app.fetch,
});

const { body } = await client.notifications();
for await (const event of body) console.log(event.id, event.data.message);
```

## Content Types

A body is JSON unless a `content-type` header says otherwise. These codecs
are built in, and each is exported the same way from `@rest-rpc/server` and
`@rest-rpc/core`.

See [Encoding and Content Types](https://rest-rpc.vercel.app/docs/http-behavior/encoding#bodies)

```ts
import {
	jsonCodec, // application/json and +json: any value JSON.stringify encodes
	urlEncodedCodec, // application/x-www-form-urlencoded: URLSearchParams
	formDataCodec, // multipart/form-data: FormData
	textCodec, // text/*: strings, decoded as UTF-8
	binaryCodec, // any other media type: Blob, Uint8Array, ReadableStream or async iterable, received as a Blob
} from "@rest-rpc/server";
```

## Codecs

A codec encodes another format. Pass the same codec in `bodyCodecs` to the
client and the server. Custom codecs win over the built-in ones.

See [Custom Codecs](https://rest-rpc.vercel.app/docs/http-behavior/encoding#custom-codecs)

```ts
import { bodyCodec, createApp, createClient, route } from "@rest-rpc/server";

const csvCodec = bodyCodec("text/csv", {
	serialize: (rows) =>
		(rows as string[][]).map((row) => row.join(",")).join("\n"),
	deserialize: async (body) =>
		(await body.text()).split("\n").map((line) => line.split(",")),
});

const routes = {
	posts: {
		csv: route.get("/posts.csv").handler(({ respond }) =>
			respond(
				[
					["id", "title"],
					["post_1", "Hello"],
				],
				{ headers: { "content-type": "text/csv" } },
			),
		),
	},
};

const app = createApp(routes, { bodyCodecs: [csvCodec] });
const client = createClient(routes, {
	origin: "http://localhost",
	fetch: app.fetch,
	bodyCodecs: [csvCodec],
});

const { body } = await client.posts.csv(); // string[][]
```

## Raw and Static Responses

Return a Fetch `Response` for anything else, such as a redirect. A route that
always sends the same response is `.static()`, built once.

See [Raw Responses](https://rest-rpc.vercel.app/docs/route-builder#raw-responses)

```ts
import { route } from "@rest-rpc/server";

const download = route
	.get("/images/:id")
	.handler(({ params }) =>
		Response.redirect(`https://cdn.example.com/${params.id}`, 302),
	);

const health = route.get("/health").static({ ok: true });
```

## Interceptors

Interceptors run around every request the app serves, for what rest-rpc
leaves to the app, such as API keys, CORS and error reporting.

See [Interceptors](https://rest-rpc.vercel.app/docs/server/interceptors)

```ts
import {
	createApp,
	errorResponse,
	interceptor,
	onError,
	route,
} from "@rest-rpc/server";

const requestId = interceptor(async ({ next }) => {
	const response = await next();
	const copy = new Response(response.body, response); // its headers may be immutable
	copy.headers.set("x-request-id", crypto.randomUUID());
	return copy;
});

const routes = { hello: route.get("/hello").handler(() => "Hello") };

export default createApp(routes, {
	interceptors: [
		requestId,
		interceptor(({ next }) => next().catch(errorResponse)), // errors reach requestId as responses
		onError((error) => console.error(error)), // every error, with its cause
	],
});
```

## Node

`@rest-rpc/server/node` serves the same routes with `node:http`.

See [Node](https://rest-rpc.vercel.app/docs/server/node)

```ts
import { createServer } from "node:http";
import { route } from "@rest-rpc/server";
import { createApp } from "@rest-rpc/server/node";

const routes = { hello: route.get("/hello").handler(() => "Hello") };

createServer(createApp(routes)).listen(3000);
```

## Frameworks

Mount the routes in a framework under one route, or register each on its
router.

See [Framework Integration](https://rest-rpc.vercel.app/docs/server/framework-integration)

```ts
import { Hono } from "hono";
import { createCatchAllHandler, route } from "@rest-rpc/server";

const routes = { hello: route.get("/hello").handler(() => "Hello") };
const handler = createCatchAllHandler(routes);

const app = new Hono();
app.all("/api/*", async (c) => {
	const result = await handler(c.req.raw, { mountPath: "/api" });
	return result.matched ? result.response : c.notFound();
});

export default app;
```

## Browser Clients

A bundler macro runs `extractContract()` at build time and inlines the routes'
methods, paths, statuses and error codes, so no server code ships. Bun runs
macros itself, and Vite and other bundlers with `unplugin-macros`.

See [Contract Extraction](https://rest-rpc.vercel.app/docs/client/contract-extraction)

```ts
// client/contract.ts
import { extractContract } from "@rest-rpc/core";
import { routes } from "../server/routes.ts";

export function getApi() {
	return extractContract(routes);
}
```

```ts
// client/api.ts
import { createClient } from "@rest-rpc/core";
import { getApi } from "./contract.ts" with { type: "macro" };

export const client = createClient(getApi()); // the page's origin, or pass { origin }
```

```ts
// vite.config.ts
import Macros from "unplugin-macros/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [Macros()] });
```

## Client Options

Headers for every request, the server's mount path, and interceptors around
each request.

See [Fetch Client](https://rest-rpc.vercel.app/docs/client/fetch-client#client-options)

```ts
import { clientInterceptor, createClient } from "@rest-rpc/core";
import { route } from "@rest-rpc/server";

const routes = { hello: route.get("/hello").handler(() => "Hello") };

const logging = clientInterceptor(async ({ request, next }) => {
	const response = await next();
	console.log(request.method, request.url, response.status);
	return response;
});

const client = createClient(routes, {
	origin: "https://api.example.com",
	mountPath: "/api",
	globalHeaders: {
		authorization: () => `Bearer ${localStorage.getItem("token")}`,
	},
	interceptors: [logging],
	timeoutMs: 10_000,
});
```

## TanStack Query

Query and mutation options for each route, with typed keys.

See [TanStack Query](https://rest-rpc.vercel.app/docs/client/tanstack-query)

```tsx
import { createClient } from "@rest-rpc/core";
import { route } from "@rest-rpc/server";
import { createTanstackQueryUtils } from "@rest-rpc/tanstack-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

const routes = {
	posts: {
		list: route
			.get("/posts")
			.handler(() => [{ id: "1", title: "Hello", body: "First post" }]),
		create: route
			.body(z.object({ title: z.string(), body: z.string() }))
			.handler(({ body }) => body),
	},
};

const restrpc = createTanstackQueryUtils(
	createClient(routes, { origin: "https://api.example.com" }),
);

export function Posts() {
	const queryClient = useQueryClient();
	const posts = useQuery(
		restrpc.posts.list.queryOptions({ select: (response) => response.body }),
	);
	const create = useMutation(
		restrpc.posts.create.mutationOptions({
			onSuccess: () =>
				queryClient.invalidateQueries({
					queryKey: restrpc.posts.list.queryKey(),
				}),
		}),
	);
	return (
		<button
			onClick={() =>
				create.mutate({ body: { title: "Hello", body: "First post" } })
			}
		>
			{posts.data?.length ?? 0} posts
		</button>
	);
}
```

## Contract-first

Define the routes in a shared contract with `@rest-rpc/core`, and implement
them on the server. The client uses the contract directly, schemas included.

See [Contract-first](https://rest-rpc.vercel.app/docs/contract-first)

```ts
import { createClient, route } from "@rest-rpc/core";
import { createApp, implement } from "@rest-rpc/server";
import { z } from "zod";

const api = {
	posts: {
		get: route
			.get("/posts/:id")
			.response(
				z.object({ id: z.string(), title: z.string(), body: z.string() }),
			)
			.error("POST_NOT_FOUND", { status: 404 }),
	},
};

const routes = {
	posts: {
		get: implement(api.posts.get).handler(({ params }) => ({
			id: params.id,
			title: "Hello",
			body: "First post",
		})),
	},
};

const app = createApp(routes);
const client = createClient(api, {
	origin: "http://localhost",
	fetch: app.fetch,
	validateResponses: true,
});
```

## Local Calls

`call()` runs one route in process, through validation and middleware, without
HTTP. To call the app in process with HTTP behavior, pass `app.fetch` to
`createClient` as in [Hello World](#hello-world).

See [Local Calls](https://rest-rpc.vercel.app/docs/client/local-calls)

```ts
import { call, route } from "@rest-rpc/server";
import { z } from "zod";

const double = route
	.get("/double/:n")
	.params(z.object({ n: z.coerce.number() }))
	.handler(({ params }) => params.n * 2);

const { body } = await call(double, { params: { n: 21 } });
console.log(body); // 42
```

## OpenAPI

An OpenAPI document from the same routes, with a converter for your schema
library.

See [OpenAPI](https://rest-rpc.vercel.app/docs/openapi)

```ts
import { createOpenApiDocument, route } from "@rest-rpc/server";
import { z } from "zod";

const routes = {
	posts: {
		list: route
			.get("/posts")
			.response(
				z.array(
					z.object({ id: z.string(), title: z.string(), body: z.string() }),
				),
			)
			.openAPI({ summary: "List posts", tags: ["Posts"] })
			.handler(() => [{ id: "1", title: "Hello", body: "First post" }]),
	},
};

const document = createOpenApiDocument(routes, {
	info: { title: "Blog API", version: "1.0.0" },
	schemaConverter: (schema, io) => z.toJSONSchema(schema as z.ZodType, { io }),
});
```

## Type Helpers

Reuse a route's types in code outside it, such as a service written apart
from its route.

See [Type Helpers](https://rest-rpc.vercel.app/docs/route-builder#type-helpers)

```ts
import type { InferClientResponse } from "@rest-rpc/core";
import { route, type InferServerRequest } from "@rest-rpc/server";
import { z } from "zod";

const update = route
	.patch("/posts/:id")
	.body(z.object({ title: z.string(), body: z.string() }));

const updatePost = ({ params, body }: InferServerRequest<typeof update>) => ({
	id: params.id,
	title: body.title,
	body: body.body,
});

const routes = { update: update.handler(updatePost) };

type UpdateResponse = InferClientResponse<typeof routes.update>; // { status: 200; body: { id; title; body }; ... }
```
