import { initClient, request } from "@rest-rpc/core";
import type { ServerRouteFactory } from "@rest-rpc/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

declare const route: ServerRouteFactory;

const todo = z.object({ id: z.string(), title: z.string() });

const routes = {
	todos: {
		shorthandGet: route.handler(() => ({
			id: "todo-1",
			title: "Todo",
		})),
		shorthandCreate: route
			.input(z.object({ title: z.string() }))
			.handler(({ input }) => ({ id: "todo-1", title: input.title })),
		shorthandDeclaredGet: route.output(todo).handler(() => ({
			id: "todo-1",
			title: "Todo",
		})),
		shorthandDeclaredCreate: route
			.input(z.object({ title: z.string() }))
			.output(todo)
			.handler(({ input }) => ({ id: "todo-1", title: input.title })),
		create: route
			.post("/todos/:accountId")
			.params(z.object({ accountId: z.string() }))
			.query(z.object({ notify: z.boolean() }))
			.body(z.object({ title: z.string() }))
			.response(201, todo)
			.handler(
				({ params: { accountId }, query: { notify }, body: { title } }) => ({
					status: 201,
					body: { id: accountId, title: notify ? title : title },
				}),
			),
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, todo)
			.response(404, z.object({ code: z.literal("not_found") }))
			.handler(({ params: { id } }) =>
				id === "missing"
					? { status: 404 as const, body: { code: "not_found" as const } }
					: { status: 200 as const, body: { id, title: "Todo" } },
			),
		stream: route.get("/todos/stream").handler(() => ({
			status: 200,
			body: (async function* () {
				yield {
					id: "todo-1",
					title: "Todo",
				};
			})(),
		})),
		inferred: route
			.get("/inferred-todos/:id")
			.params(z.object({ id: z.string() }))
			.handler(({ params: { id } }) =>
				id === "missing"
					? { status: 404 as const, body: { code: "not_found" as const } }
					: { status: 200 as const, body: { id, title: "Todo" } },
			),
		withResponseHeaders: route.get("/with-response-headers").handler(() => ({
			status: 200,
			body: { id: "todo-1" },
			responseHeaders: { etag: "todo-1", "x-page": 1 },
		})),
	},
	explicitOnly: {
		health: route.get("/health").handler(() => ({ status: 204 as const })),
	},
	form: route
		.post("/form")
		.formBody(
			z.object({ title: z.string(), tags: z.array(z.string()).optional() }),
		)
		.handler(({ body }) => ({ status: 204 as const, body: body.title })),
	upload: route
		.post("/upload")
		.multipartBody(z.object({ title: z.string(), file: z.instanceof(Blob) }))
		.handler(({ body }) => ({ status: 204 as const, body: body.title })),
	search: route
		.get("/search")
		.jsonQuery(z.object({ page: z.number(), filters: z.array(z.string()) }))
		.handler(({ query }) => ({ status: 200 as const, body: query.page })),
	custom: route
		.post("/custom")
		.customBody({ contentType: "text/csv", schema: z.string() })
		.handler(({ body }) => ({ status: 204 as const, body })),
	selectableCustom: route
		.post("/selectable-custom")
		.customBody({
			contentType: ["image/png", "image/jpeg"] as const,
			schema: z.instanceof(Uint8Array),
		})
		.handler(({ body }) => ({ status: 204 as const, body: body.contentType })),
	fetchManagedCustom: route
		.post("/fetch-managed-custom")
		.customBody(z.instanceof(URLSearchParams))
		.handler(() => ({ status: 204 as const })),
} as const;

const client = initClient<typeof routes>({
	baseUrl: "https://example.test",
});

expectType<Promise<{ readonly id: "todo-1"; readonly title: "Todo" }>>(
	client.todos.shorthandGet(),
);
expectType<Promise<{ readonly id: "todo-1"; readonly title: string }>>(
	client.todos.shorthandCreate({ title: "Write tests" }),
);
expectType<Promise<{ id: string; title: string }>>(
	client.todos.shorthandDeclaredGet(),
);
expectType<Promise<{ id: string; title: string }>>(
	client.todos.shorthandDeclaredCreate({ title: "Write tests" }),
);
expectError(client.todos.shorthandCreate());
expectError(client.todos.shorthandCreate({ title: 1 }));
expectError(client.todos.shorthandGet.fetch);
expectError(client.todos.create);
expectError(client.events);
expectError(client.explicitOnly);

expectError(
	initClient<typeof routes>({
		baseUrl: "https://example.test",
		validateResponses: true,
	}),
);
expectError(
	initClient<typeof routes>({
		baseUrl: "https://example.test",
		strictRequestKeys: false,
	}),
);

// Client and server inputs use the same HTTP segments.
client
	.$post("/todos/:accountId", {
		body: { title: "Write tests" },
		params: { accountId: "account-1" },
		query: { notify: true },
	})
	.then((response) => {
		expectType<{ id: string; title: string }>(response.body);
	});
expectError(
	client.$post("/todos/:accountId", {
		accountId: "account-1",
		notify: true,
		title: "Write tests",
	}),
);

// Selection is restricted to method/path pairs present in the implementation tree.
expectError(client.$get("/todos/:accountId"));
expectError(client.$post("/todos/:id"));

// Server-first responses are always strict, even when the server option is false.
client
	.$get("/todos/:id", { params: { id: "todo-1" } }, { cache: "no-store" })
	.then((response) => {
		expectType<200 | 404>(response.status);
		expectError(response.declared);

		if (response.status === 200) {
			expectType<{ id: string; title: string }>(response.body);
		} else {
			expectType<{ code: "not_found" }>(response.body);
		}
	});
expectError(client.$get("/todos/:id")({ params: { id: "todo-1" } }));

// Inferred response kinds flow through the existing client stream model.
client.$get("/todos/stream").then((response) => {
	expectType<AsyncIterable<{ id: string; title: string }>>(response.body);
});

client
	.$get("/inferred-todos/:id", { params: { id: "todo-1" } })
	.then((response) => {
		if (response.status === 200) {
			expectType<string>(response.body.id);
			expectType<"Todo">(response.body.title);
		} else {
			expectType<404>(response.status);
			expectType<"not_found">(response.body.code);
		}
	});

client.$get("/with-response-headers").then((response) => {
	expectType<"todo-1">(response.responseHeaders.etag);
	expectType<"1">(response.responseHeaders["x-page"]);
});

// Specialized encodings are explicit and constrained by the server route.
client.$post("/form", {
	body: request.formBody({ title: "Todo", tags: ["docs", "api"] }),
});
expectError(client.$post("/form", { body: { title: "Todo" } }));

client.$post("/upload", {
	body: request.multipartBody({ title: "Todo", file: new Blob() }),
});
client.$get("/search", {
	query: request.jsonQuery({ page: 2, filters: ["open"] }),
});
client.$post("/custom", {
	body: request.customBody("text/csv", "id,title\n1,Todo\n"),
});
expectError(
	client.$post("/custom", {
		body: request.customBody("application/json", "value"),
	}),
);
client.$post("/selectable-custom", {
	body: request.customBody("image/png", new Uint8Array()),
});
expectError(
	client.$post("/selectable-custom", {
		body: request.customBody("image/webp", new Uint8Array()),
	}),
);
client.$post("/fetch-managed-custom", {
	body: request.customBody(new URLSearchParams({ title: "Todo" })),
});
