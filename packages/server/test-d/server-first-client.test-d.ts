import { initServerFirstClient, request } from "@rest-rpc/core";
import type { ServerRouteFactory } from "@rest-rpc/server";
import { sseEvent } from "@rest-rpc/server";
import { expectError, expectType } from "tsd";
import { z } from "zod";

declare const route: ServerRouteFactory;

const todo = z.object({ id: z.string(), title: z.string() });

const routes = {
	todos: {
		create: route
			.post("/todos/:accountId")
			.params(z.object({ accountId: z.string() }))
			.query(z.object({ notify: z.boolean() }))
			.body(z.object({ title: z.string() }))
			.response(201, todo)
			.handler(({ accountId, notify, title }) => ({
				status: 201,
				body: { id: accountId, title: notify ? title : title },
			})),
		get: route
			.with({ strictStatusCodes: false })
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, todo)
			.response(404, z.object({ code: z.literal("not_found") }))
			.handler(({ id }) =>
				id === "missing"
					? { status: 404 as const, body: { code: "not_found" as const } }
					: { status: 200 as const, body: { id, title: "Todo" } },
			),
		stream: route.get("/todos/stream").handler(() => ({
			status: 200,
			body: (async function* () {
				yield { id: "todo-1", title: "Todo" };
			})(),
		})),
		inferred: route
			.get("/inferred-todos/:id")
			.params(z.object({ id: z.string() }))
			.handler(({ id }) =>
				id === "missing"
					? { status: 404 as const, body: { code: "not_found" as const } }
					: { status: 200 as const, body: { id, title: "Todo" } },
			),
	},
	events: route
		.sse("/events")
		.response(z.object({ id: z.string() }))
		.handler(async function* () {
			yield sseEvent({ id: "todo-1" });
		}),
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

const client = initServerFirstClient<typeof routes>({
	baseUrl: "https://example.test",
});

expectError(
	initServerFirstClient<typeof routes>({
		baseUrl: "https://example.test",
		validateResponses: true,
	}),
);
expectError(
	initServerFirstClient<typeof routes>({
		baseUrl: "https://example.test",
		strictRequestKeys: false,
	}),
);

// Client inputs are grouped even though the server handler uses flattened keys.
expectType<Promise<{ id: string; title: string }>>(
	client.post("/todos/:accountId").fetch({
		body: { title: "Write tests" },
		params: { accountId: "account-1" },
		query: { notify: true },
	}),
);
expectError(
	client.post("/todos/:accountId").fetch({
		accountId: "account-1",
		notify: true,
		title: "Write tests",
	}),
);

// Selection is restricted to method/path pairs present in the implementation tree.
expectError(client.get("/todos/:accountId"));
expectError(client.post("/todos/:id"));

// Server-first responses are always strict, even when the server option is false.
client
	.get("/todos/:id")
	.fetchResponse({ params: { id: "todo-1" } })
	.then((response) => {
		expectType<200 | 404>(response.status);
		expectError(response.declared);

		if (response.status === 200) {
			expectType<{ id: string; title: string }>(response.body);
		} else {
			expectType<{ code: "not_found" }>(response.body);
		}
	});

// Inferred response kinds flow through the existing client stream model.
expectType<Promise<AsyncIterable<{ id: string; title: string }>>>(
	client.get("/todos/stream").fetch(),
);

client
	.get("/inferred-todos/:id")
	.fetchResponse({ params: { id: "todo-1" } })
	.then((response) => {
		if (response.status === 200) {
			expectType<string>(response.body.id);
			expectType<"Todo">(response.body.title);
		} else {
			expectType<404>(response.status);
			expectType<"not_found">(response.body.code);
		}
	});

client
	.sse("/events")
	.openConnection()
	.onMessage((message) => {
		expectType<{ id: string }>(message);
	});
expectError(client.get("/events"));

// Specialized encodings are explicit and constrained by the server route.
client.post("/form").fetch({
	body: request.formBody({ title: "Todo", tags: ["docs", "api"] }),
});
expectError(client.post("/form").fetch({ body: { title: "Todo" } }));

client.post("/upload").fetch({
	body: request.multipartBody({ title: "Todo", file: new Blob() }),
});
client.get("/search").fetch({
	query: request.jsonQuery({ page: 2, filters: ["open"] }),
});
client.post("/custom").fetch({
	body: request.customBody("text/csv", "id,title\n1,Todo\n"),
});
expectError(
	client.post("/custom").fetch({
		body: request.customBody("application/json", "value"),
	}),
);
client.post("/selectable-custom").fetch({
	body: request.customBody("image/png", new Uint8Array()),
});
expectError(
	client.post("/selectable-custom").fetch({
		body: request.customBody("image/webp", new Uint8Array()),
	}),
);
client.post("/fetch-managed-custom").fetch({
	body: request.customBody(new URLSearchParams({ title: "Todo" })),
});
