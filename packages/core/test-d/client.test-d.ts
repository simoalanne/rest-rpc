import {
	type ApiClientFor,
	type ApiClientRouteValue,
	type ClientRequest,
	type ClientResponse,
	initClient,
	route,
	type as schemaType,
} from "@rest-rpc/core";
import { expectError, expectType } from "tsd";
import { z } from "zod";

const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
});

const shorthandInputSchema = z
	.object({ title: z.string() })
	.transform(({ title }) => ({ title, normalized: true as const }));
const shorthandOutputSchema = todoSchema.transform(({ id, title }) => ({
	id: Number(id),
	title,
}));

const shorthandApi = {
	todos: {
		get: route.output(shorthandOutputSchema),
		add: route.input(shorthandInputSchema).output(shorthandOutputSchema),
	},
};

const shorthandClient = initClient(shorthandApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: number; title: string }>>(shorthandClient.todos.get());
expectType<ApiClientRouteValue<(typeof shorthandApi.todos.get)["~restrpc"]>>(
	shorthandClient.todos.get,
);
expectType<Promise<{ id: number; title: string }>>(
	shorthandClient.todos.add({ title: "Write type tests" }),
);
shorthandClient.todos.get(undefined, { signal: AbortSignal.abort() });
shorthandClient.todos.add(
	{ title: "Write type tests" },
	{ signal: AbortSignal.abort() },
);
expectError(shorthandClient.todos.add());
expectError(shorthandClient.todos.add({ title: 1 }));
expectError(
	shorthandClient.todos.add({ title: "Write type tests", extra: true }),
);
expectError(shorthandClient.todos.get.fetch);

expectType<{ title: string }>(
	null as unknown as ClientRequest<(typeof shorthandApi.todos.add)["~restrpc"]>,
);
expectType<never>(
	null as unknown as ClientRequest<(typeof shorthandApi.todos.get)["~restrpc"]>,
);
expectType<{ id: number; title: string }>(
	null as unknown as ClientResponse<
		(typeof shorthandApi.todos.get)["~restrpc"]
	>,
);

const noInputApi = {
	todos: {
		list: route.get("/todos").response(200, z.array(todoSchema)),
		stats: route
			.get("/todos/stats")
			.response(200, schemaType<{ total: number }>()),
	},
};

const noInputClient = initClient(noInputApi, {
	baseUrl: "https://example.test",
});

noInputClient.todos.list().then((response) => {
	if (response.status !== 200) throw new Error("Unexpected status");
	expectType<Array<{ id: string; title: string }>>(response.body);
});
noInputClient.todos.stats().then((response) => {
	if (response.status !== 200) throw new Error("Unexpected status");
	expectType<{ total: number }>(response.body);
});
noInputClient.todos.list(undefined, { cache: "no-store" });
expectError(noInputClient.todos.list.fetch);

const pathParamApi = {
	todos: {
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, todoSchema),
	},
};

const pathParamClient = initClient(pathParamApi, {
	baseUrl: "https://example.test",
});

pathParamClient.todos.get({ params: { id: "todo-1" } }).then((response) => {
	if (response.status !== 200) throw new Error("Unexpected status");
	expectType<{ id: string; title: string }>(response.body);
});

const flatQueryApi = {
	todos: {
		search: route
			.get("/todos/search")
			.query(
				z.object({
					includeDone: z.boolean().optional(),
					page: z.number(),
					search: z.string(),
				}),
			)
			.response(200, z.array(todoSchema)),
	},
};

const flatQueryClient = initClient(flatQueryApi, {
	baseUrl: "https://example.test",
});

flatQueryClient.todos
	.search({
		query: {
			includeDone: false,
			page: 1,
			search: "milk",
		},
	})
	.then((response) => {
		if (response.status !== 200) throw new Error("Unexpected status");
		expectType<Array<{ id: string; title: string }>>(response.body);
	});

const scalarRequestApi = {
	items: {
		get: route
			.get("/items/:id")
			.params(z.object({ id: z.number() }))
			.query(
				z.object({
					page: z.number(),
					active: z.boolean().optional(),
				}),
			)
			.response(204),
	},
};

const scalarRequestClient = initClient(scalarRequestApi, {
	baseUrl: "https://example.test",
});

scalarRequestClient.items.get({
	params: { id: 1 },
	query: { page: 2, active: false },
});

expectError(
	route.get("/items").query(schemaType<{ filters: { tag: string } }>()),
);
expectError(route.get("/items/:id").params(schemaType<{ id: string[] }>()));
expectError(route.get("/items").query(z.object({ page: z.coerce.number() })));
expectError(
	route.get("/items/:id").params(z.object({ id: z.coerce.number() })),
);
expectError(
	route.get("/items").headers(z.object({ "x-page": z.coerce.number() })),
);
expectError(
	route.post("/forms").formBody(z.object({ count: z.coerce.number() })),
);
expectError(
	route.post("/uploads").multipartBody(z.object({ count: z.coerce.number() })),
);
expectError(
	route.post("/forms").formBody(schemaType<{ nested: { value: string } }>()),
);
expectError(
	route
		.post("/uploads")
		.multipartBody(schemaType<{ metadata: { title: string } }>()),
);

route.post("/forms").formBody(z.object({ count: z.coerce.number<number>() }));
route.post("/uploads").multipartBody(
	schemaType<{
		file: Blob;
		parts?: Array<Blob | string>;
		title: string;
	}>(),
);

const groupedRequestApi = {
	todos: {
		create: route
			.post("/todos/:accountId")
			.params(z.object({ accountId: z.string() }))
			.query(z.object({ notify: z.boolean() }))
			.body(z.object({ title: z.string() }))
			.headers(z.object({ authorization: z.string() }))
			.response(201, todoSchema),
	},
};

const groupedRequestClient = initClient(groupedRequestApi, {
	baseUrl: "https://example.test",
});

groupedRequestClient.todos
	.create({
		body: { title: "Write type tests" },
		headers: {
			authorization: "Bearer token",
		},
		params: { accountId: "account-1" },
		query: { notify: true },
	})
	.then((response) => {
		if (response.status !== 201) throw new Error("Unexpected status");
		expectType<{ id: string; title: string }>(response.body);
	});
expectError(
	groupedRequestClient.todos.create({
		accountId: "account-1",
		notify: true,
		title: "Write type tests",
	}),
);

const groupedRequestFactory = route;
const groupedRequestWithApi = {
	todos: {
		create: groupedRequestFactory
			.post("/todos/:accountId")
			.params(z.object({ accountId: z.string() }))
			.query(z.object({ notify: z.boolean() }))
			.body(z.object({ title: z.string() }))
			.response(201, todoSchema),
	},
};

const groupedRequestWithClient = initClient(groupedRequestWithApi, {
	baseUrl: "https://example.test",
});

groupedRequestWithClient.todos
	.create({
		body: { title: "Write type tests" },
		params: { accountId: "account-1" },
		query: { notify: true },
	})
	.then((response) => {
		if (response.status !== 201) throw new Error("Unexpected status");
		expectType<{ id: string; title: string }>(response.body);
	});
expectError(
	groupedRequestWithClient.todos.create({
		accountId: "account-1",
		notify: true,
		title: "Write type tests",
	}),
);

const jsonQueryApi = {
	todos: {
		jsonSearch: route
			.get("/todos/json-search")
			.jsonQuery(
				z.object({
					page: z.string().transform((value) => Number(value)),
					filters: z.object({ tags: z.array(z.string()) }),
				}),
			)
			.response(200, z.array(todoSchema)),
		optionalJsonSearch: route
			.get("/todos/optional-json-search")
			.jsonQuery(z.object({ page: z.number() }).optional())
			.response(200, z.array(todoSchema)),
	},
};

const jsonQueryClient = initClient(jsonQueryApi, {
	baseUrl: "https://example.test",
});

jsonQueryClient.todos
	.jsonSearch({
		query: {
			page: "1",
			filters: { tags: ["api"] },
		},
	})
	.then((response) => {
		if (response.status !== 200) throw new Error("Unexpected status");
		expectType<Array<{ id: string; title: string }>>(response.body);
	});
expectError(jsonQueryClient.todos.jsonSearch({ query: { page: "1" } }));
expectError(jsonQueryClient.todos.jsonSearch());
jsonQueryClient.todos
	.optionalJsonSearch({ query: undefined })
	.then((response) => {
		if (response.status !== 200) throw new Error("Unexpected status");
		expectType<Array<{ id: string; title: string }>>(response.body);
	});
expectError(jsonQueryClient.todos.optionalJsonSearch({}));
expectError(jsonQueryClient.todos.optionalJsonSearch());

const responseApi = {
	todos: {
		create: route
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, {
				body: todoSchema,
				headers: z.object({
					location: z.string(),
					"x-next-cursor": z.string().optional(),
				}),
			}),
	},
};

const responseClient = initClient(responseApi, {
	baseUrl: "https://example.test",
});

responseClient.todos
	.create({ body: { title: "Write type tests" } })
	.then((response) => {
		if (response.status !== 201) throw new Error("Unexpected status");
		expectType<{ id: string; title: string }>(response.body);
	});

responseClient.todos
	.create({ body: { title: "Write type tests" } })
	.then((response) => {
		expectError(response.declared);
		expectType<201>(response.status);
		expectType<{ id: string; title: string }>(response.body);
		expectType<string>(response.responseHeaders.location);
		expectType<string | undefined>(response.responseHeaders["x-next-cursor"]);
		expectType<Headers>(response.headers);
		expectError(response.rawResponse);
	});

const declaredResponseApi = {
	todos: {
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, todoSchema)
			.response(404, z.object({ code: z.literal("not_found") })),
	},
};

const declaredResponseClient = initClient(declaredResponseApi, {
	baseUrl: "https://example.test",
});

declaredResponseClient.todos
	.get({ params: { id: "todo-1" } })
	.then((response) => {
		expectType<200 | 404>(response.status);
		expectType<Headers>(response.headers);
		expectError(response.declared);

		if (response.status === 200) {
			expectType<{ id: string; title: string }>(response.body);
		} else {
			expectType<{ code: "not_found" }>(response.body);
		}
	});

type DeclaredRouteClientResponseType = ClientResponse<
	(typeof declaredResponseApi.todos.get)["~restrpc"]
>;

expectType<never>(
	null as unknown as Extract<
		DeclaredRouteClientResponseType,
		{ rawResponse: Response }
	>,
);

expectType<Promise<DeclaredRouteClientResponseType>>(
	declaredResponseClient.todos.get({ params: { id: "todo-1" } }),
);
expectType<ApiClientFor<typeof declaredResponseApi>>(declaredResponseClient);

const transformedApi = {
	todos: {
		transform: route
			.post("/todos/:id/transform")
			.params(
				z.object({ id: z.string() }).transform(({ id }) => ({
					id: Number(id),
				})),
			)
			.body(
				z.object({ title: z.string() }).transform(({ title }) => ({
					title: title.trim(),
					slug: title.toLowerCase(),
				})),
			)
			.response(
				200,
				z.object({ id: z.number() }).transform(({ id }) => ({
					id: String(id),
				})),
			),
	},
};

const transformedClient = initClient(transformedApi, {
	baseUrl: "https://example.test",
});

transformedClient.todos
	.transform({ params: { id: "1" }, body: { title: "Write type tests" } })
	.then((response) => {
		if (response.status !== 200) throw new Error("Unexpected status");
		expectType<{ id: string }>(response.body);
	});
expectError(
	transformedClient.todos.transform({
		params: { id: 1 },
		body: { title: "wrong id input" },
	}),
);
expectError(
	transformedClient.todos.transform({
		slug: "server-output-only",
		params: { id: "1" },
		body: { title: "Write type tests" },
	}),
);

const streamResponseApi = {
	todos: {
		events: route
			.get("/todos/events")
			.streamResponse(200, todoSchema)
			.response(202, todoSchema)
			.response(204),
	},
};

const streamResponseClient = initClient(streamResponseApi, {
	baseUrl: "https://example.test",
});

expectType<
	Promise<ClientResponse<(typeof streamResponseApi.todos.events)["~restrpc"]>>
>(streamResponseClient.todos.events());
expectError(streamResponseClient.todos.events.fetch);

const csvResponseApi = {
	todos: {
		exportCsv: route.get("/todos.csv").customResponse(200, {
			contentType: "text/csv",
			schema: z.string(),
		}),
		exportCsvStream: route.get("/todos-stream.csv").customStreamResponse(200, {
			contentType: "text/csv",
			schema: z.string(),
		}),
	},
};

const csvResponseClient = initClient(csvResponseApi, {
	baseUrl: "https://example.test",
});

csvResponseClient.todos.exportCsv().then((response) => {
	if (response.status !== 200) throw new Error("Unexpected status");
	expectType<Response>(response.body);
});

csvResponseClient.todos.exportCsv().then((response) => {
	if (response.status === 200) {
		expectType<"text/csv">(response.contentType);
		expectType<Response>(response.body);
	}
});

csvResponseClient.todos.exportCsvStream().then((response) => {
	if (response.status !== 200) throw new Error("Unexpected status");
	expectType<Response>(response.body);
});

const imageResponseApi = {
	todos: {
		exportImage: route.get("/todos/image").customResponse(200, {
			contentType: ["image/png", "image/jpeg"],
			schema: z.instanceof(Uint8Array),
		}),
	},
};

const imageResponseClient = initClient(imageResponseApi, {
	baseUrl: "https://example.test",
});

imageResponseClient.todos.exportImage().then((response) => {
	if (response.status !== 200) throw new Error("Unexpected status");
	expectType<Response>(response.body);
});

imageResponseClient.todos.exportImage().then((response) => {
	if (response.status === 200) {
		expectType<"image/png" | "image/jpeg">(response.contentType);
		expectType<Response>(response.body);
	}
});

const customRequestApi = {
	todos: {
		uploadImage: route
			.post("/todos/:id/image")
			.params(z.object({ id: z.string() }))
			.customBody({
				contentType: ["image/png", "image/jpeg"],
				schema: z.instanceof(Uint8Array),
			})
			.response(204),
	},
};

const customRequestClient = initClient(customRequestApi, {
	baseUrl: "https://example.test",
});

customRequestClient.todos
	.uploadImage({
		body: {
			contentType: "image/png",
			payload: new Uint8Array(),
		},
		params: { id: "todo-1" },
	})
	.then((response) => {
		if (response.status !== 204) throw new Error("Unexpected status");
		expectType<undefined>(response.body);
	});
expectError(
	customRequestClient.todos.uploadImage({
		body: {
			contentType: "image/webp",
			payload: new Uint8Array(),
		},
		params: { id: "todo-1" },
	}),
);

const rawCustomRequestApi = {
	todos: {
		submitForm: route
			.post("/todos/form")
			.customBody(z.instanceof(URLSearchParams))
			.response(204),
	},
};

const rawCustomRequestClient = initClient(rawCustomRequestApi, {
	baseUrl: "https://example.test",
});

rawCustomRequestClient.todos
	.submitForm({
		body: new URLSearchParams(),
	})
	.then((response) => {
		if (response.status !== 204) throw new Error("Unexpected status");
		expectType<undefined>(response.body);
	});
expectError(
	rawCustomRequestClient.todos.submitForm({
		body: "title=Write+docs",
	}),
);

const requestArgumentApi = {
	todos: {
		list: route.get("/todos").response(200, z.array(todoSchema)),
		get: route
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, todoSchema),
		create: route
			.post("/todos")
			.body(z.object({ title: z.string() }))
			.response(201, todoSchema),
	},
};

const requestArgumentClient = initClient(requestArgumentApi, {
	baseUrl: "https://example.test",
});

expectError(requestArgumentClient.todos.get());
expectError(requestArgumentClient.todos.get({ title: "wrong segment" }));
expectError(requestArgumentClient.todos.list({ id: "todo-1" }));

const globalHeadersApi = {
	todos: {
		search: route
			.get("/todos/search")
			.query(z.object({ search: z.string() }))
			.headers(
				z.object({
					authorization: z.string(),
					"x-request-id": z.string(),
				}),
			)
			.response(200, z.array(todoSchema)),
		secure: route
			.get("/todos/secure")
			.headers(z.object({ authorization: z.string() }))
			.response(200, z.array(todoSchema)),
	},
};

const globalHeadersClient = initClient(globalHeadersApi, {
	baseUrl: "https://example.test",
	getGlobalHeaders: () => ({
		authorization: "Bearer token",
	}),
});

globalHeadersClient.todos.search({
	query: { search: "milk" },
	headers: { "x-request-id": "req-1" },
});
globalHeadersClient.todos.search({
	headers: { authorization: "Bearer override", "x-request-id": "req-1" },
	query: { search: "milk" },
});
globalHeadersClient.todos.secure({});
expectError(globalHeadersClient.todos.search({ query: { search: "milk" } }));
expectError(
	globalHeadersClient.todos.search({ headers: { "x-request-id": "req-1" } }),
);
expectError(globalHeadersClient.todos.secure());

const looseGlobalHeadersClient = initClient(globalHeadersApi, {
	baseUrl: "https://example.test",
	getGlobalHeaders: (): Record<string, string> => ({
		authorization: "Bearer token",
	}),
});

expectError(looseGlobalHeadersClient.todos.search({}));
expectError(
	looseGlobalHeadersClient.todos.search({ query: { search: "milk" } }),
);
expectError(looseGlobalHeadersClient.todos.search());

const composedHeadersApi = {
	todos: {
		get: route
			.with({
				headers: z.object({ shared: z.string(), inherited: z.string() }),
			})
			.get("/todos/composed")
			.headers(z.object({ shared: z.number(), local: z.boolean() }))
			.response(204),
	},
};
const composedHeadersClient = initClient(composedHeadersApi, {
	baseUrl: "https://example.test",
});
expectError(
	composedHeadersClient.todos.get({
		headers: {
			shared: "cannot satisfy both schemas",
			inherited: "token",
			local: true,
		},
	}),
);

const additiveHeadersApi = {
	items: route
		.with({ headers: z.object({ authorization: z.string() }) })
		.get("/items")
		.headers(z.object({ "x-request-id": z.string() }))
		.response(204),
};
const additiveHeadersClient = initClient(additiveHeadersApi, {
	baseUrl: "https://example.test",
});
additiveHeadersClient.items({
	headers: {
		authorization: "Bearer token",
		"x-request-id": "request-1",
	},
});
expectError(
	additiveHeadersClient.items({
		headers: {
			authorization: "Bearer token",
		},
	}),
);
expectError(
	additiveHeadersClient.items({ headers: { "x-request-id": "request-1" } }),
);
