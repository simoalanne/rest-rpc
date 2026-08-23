import {
	type ClientResponse,
	customBody,
	initClient,
	jsonQuery,
	noBody,
	router,
	type as schemaType,
	stream,
	webSocketMessages,
} from "@rest-rpc/core";
import { expectError, expectType } from "tsd";
import { z } from "zod";

const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
});

// client route types

// should infer fetch return bodies for routes without request input
const noInputApi = router({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: z.array(todoSchema),
			},
		},
		stats: {
			method: "GET",
			path: "/todos/stats",
			responses: {
				200: schemaType<{ total: number }>(),
			},
		},
	},
});

const noInputClient = initClient(noInputApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	noInputClient.todos.list.fetch(),
);

expectType<Promise<{ total: number }>>(noInputClient.todos.stats.fetch());

// should infer fetch return bodies for path params
const pathParamApi = router({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: todoSchema,
			},
		},
	},
});

const pathParamClient = initClient(pathParamApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string; title: string }>>(
	pathParamClient.todos.get.fetch({ id: "todo-1" }),
);

// should infer fetch return bodies for flat query input
const flatQueryApi = router({
	todos: {
		search: {
			method: "GET",
			path: "/todos/search",
			query: z.object({
				includeDone: z.boolean().optional(),
				page: z.number(),
				search: z.string(),
			}),
			responses: {
				200: z.array(todoSchema),
			},
		},
	},
});

const flatQueryClient = initClient(flatQueryApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	flatQueryClient.todos.search.fetch({
		includeDone: false,
		page: 1,
		search: "milk",
	}),
);

// should infer fetch return bodies and request input for JSON query routes
const jsonQueryApi = router({
	todos: {
		jsonSearch: {
			method: "GET",
			path: "/todos/json-search",
			query: jsonQuery(
				z.object({
					page: z.string().transform((value) => Number(value)),
					filters: z.object({ tags: z.array(z.string()) }),
				}),
			),
			responses: {
				200: z.array(todoSchema),
			},
		},
		optionalJsonSearch: {
			method: "GET",
			path: "/todos/optional-json-search",
			query: jsonQuery(z.object({ page: z.number() }).optional()),
			responses: {
				200: z.array(todoSchema),
			},
		},
	},
});

const jsonQueryClient = initClient(jsonQueryApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Array<{ id: string; title: string }>>>(
	jsonQueryClient.todos.jsonSearch.fetch({
		query: {
			page: "1",
			filters: { tags: ["api"] },
		},
	}),
);

expectError(jsonQueryClient.todos.jsonSearch.fetch({ page: "1" }));
expectError(jsonQueryClient.todos.jsonSearch.fetch());

expectType<Promise<Array<{ id: string; title: string }>>>(
	jsonQueryClient.todos.optionalJsonSearch.fetch({ query: undefined }),
);

expectError(jsonQueryClient.todos.optionalJsonSearch.fetch({}));
expectError(jsonQueryClient.todos.optionalJsonSearch.fetch());

// should infer declared response envelopes and headers from fetchResponse
const responseApi = router({
	todos: {
		create: {
			method: "POST",
			path: "/todos",
			body: z.object({ title: z.string() }),
			responses: {
				201: {
					body: todoSchema,
					headers: {
						location: z.string(),
						"x-next-cursor": z.string().optional(),
					},
				},
			},
		},
	},
});

const responseClient = initClient(responseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string; title: string }>>(
	responseClient.todos.create.fetch({ title: "Write type tests" }),
);

responseClient.todos.create
	.fetchResponse({ title: "Write type tests" })
	.then((response) => {
		if (response.declared) {
			expectType<201>(response.status);
			expectType<{ id: string; title: string }>(response.body);
			expectType<string>(response.responseHeaders.location);
			expectType<string | undefined>(response.responseHeaders["x-next-cursor"]);
			expectType<Headers>(response.headers);
		}
	});

const strictResponseApi = router({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: todoSchema,
				404: z.object({ code: z.literal("not_found") }),
			},
		},
	},
});

const strictResponseClient = initClient(strictResponseApi, {
	baseUrl: "https://example.test",
	strictStatusCodes: true,
});

strictResponseClient.todos.get
	.fetchResponse({ id: "todo-1" })
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

// should use schema input for requests and schema output for responses
const transformedApi = router({
	todos: {
		transform: {
			method: "POST",
			path: "/todos/:id/transform",
			pathParams: z.object({ id: z.string() }).transform(({ id }) => ({
				id: Number(id),
			})),
			body: z.object({ title: z.string() }).transform(({ title }) => ({
				title: title.trim(),
				slug: title.toLowerCase(),
			})),
			responses: {
				200: z.object({ id: z.number() }).transform(({ id }) => ({
					id: String(id),
				})),
			},
		},
	},
});

const transformedClient = initClient(transformedApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<{ id: string }>>(
	transformedClient.todos.transform.fetch({
		id: "1",
		title: "Write type tests",
	}),
);

expectError(
	transformedClient.todos.transform.fetch({ id: 1, title: "wrong id input" }),
);

expectError(
	transformedClient.todos.transform.fetch({
		id: "1",
		title: "Write type tests",
		slug: "server-output-only",
	}),
);

// should keep stream and custom response routes on fetchResponse or Response bodies
const streamResponseApi = router({
	todos: {
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: stream(todoSchema),
				202: todoSchema,
				204: noBody(),
			},
		},
	},
});

const streamResponseClient = initClient(streamResponseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<ClientResponse<typeof streamResponseApi.todos.events>>>(
	streamResponseClient.todos.events.fetchResponse(),
);

expectError(streamResponseClient.todos.events.fetch());

const csvResponseApi = router({
	todos: {
		exportCsv: {
			method: "GET",
			path: "/todos.csv",
			responses: {
				200: customBody({
					contentType: "text/csv",
					schema: z.string(),
				}),
			},
		},
		exportCsvStream: {
			method: "GET",
			path: "/todos-stream.csv",
			responses: {
				200: stream(
					customBody({
						contentType: "text/csv",
						schema: z.string(),
					}),
				),
			},
		},
	},
});

const csvResponseClient = initClient(csvResponseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Response>>(csvResponseClient.todos.exportCsv.fetch());

csvResponseClient.todos.exportCsv.fetchResponse().then((response) => {
	if (response.declared) {
		expectType<"text/csv">(response.contentType);
		expectType<Response>(response.body);
	}
});

expectType<Promise<Response>>(csvResponseClient.todos.exportCsvStream.fetch());

const imageResponseApi = router({
	todos: {
		exportImage: {
			method: "GET",
			path: "/todos/image",
			responses: {
				200: customBody({
					contentType: ["image/png", "image/jpeg"],
					schema: z.instanceof(Uint8Array),
				}),
			},
		},
	},
});

const imageResponseClient = initClient(imageResponseApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<Response>>(imageResponseClient.todos.exportImage.fetch());

imageResponseClient.todos.exportImage.fetchResponse().then((response) => {
	if (response.declared) {
		expectType<"image/png" | "image/jpeg">(response.contentType);
		expectType<Response>(response.body);
	}
});

// should type custom request bodies by selected content type and payload
const customRequestApi = router({
	todos: {
		uploadImage: {
			method: "POST",
			path: "/todos/:id/image",
			pathParams: z.object({ id: z.string() }),
			body: customBody({
				contentType: ["image/png", "image/jpeg"],
				schema: z.instanceof(Uint8Array),
			}),
			responses: {
				204: noBody(),
			},
		},
	},
});

const customRequestClient = initClient(customRequestApi, {
	baseUrl: "https://example.test",
});

expectType<Promise<undefined>>(
	customRequestClient.todos.uploadImage.fetch({
		id: "todo-1",
		body: {
			contentType: "image/png",
			payload: new Uint8Array(),
		},
	}),
);

expectError(
	customRequestClient.todos.uploadImage.fetch({
		id: "todo-1",
		body: {
			contentType: "image/webp",
			payload: new Uint8Array(),
		},
	}),
);

// should reject invalid request argument positions and flattened input
const requestArgumentApi = router({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: z.array(todoSchema),
			},
		},
		get: {
			method: "GET",
			path: "/todos/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: todoSchema,
			},
		},
		create: {
			method: "POST",
			path: "/todos",
			body: z.object({ title: z.string() }),
			responses: {
				201: todoSchema,
			},
		},
	},
});

const requestArgumentClient = initClient(requestArgumentApi, {
	baseUrl: "https://example.test",
});

expectError(requestArgumentClient.todos.get.fetch());
expectError(requestArgumentClient.todos.get.fetch({ title: "wrong segment" }));

expectError(requestArgumentClient.todos.list.fetch({ id: "todo-1" }));

// should make request keys provided by global headers optional
const globalHeadersApi = router({
	todos: {
		search: {
			method: "GET",
			path: "/todos/search",
			query: z.object({ search: z.string() }),
			headers: {
				authorization: z.string(),
				"x-request-id": z.string(),
			},
			responses: {
				200: z.array(todoSchema),
			},
		},
		secure: {
			method: "GET",
			path: "/todos/secure",
			headers: {
				authorization: z.string(),
			},
			responses: {
				200: z.array(todoSchema),
			},
		},
	},
});

const globalHeadersClient = initClient(globalHeadersApi, {
	baseUrl: "https://example.test",
	getGlobalHeaders: () => ({
		authorization: "Bearer token",
	}),
});

globalHeadersClient.todos.search.fetch({
	search: "milk",
	"x-request-id": "req-1",
});

globalHeadersClient.todos.search.fetch({
	authorization: "Bearer override",
	search: "milk",
	"x-request-id": "req-1",
});

globalHeadersClient.todos.secure.fetch({});

expectError(globalHeadersClient.todos.search.fetch({ search: "milk" }));
expectError(
	globalHeadersClient.todos.search.fetch({ "x-request-id": "req-1" }),
);
expectError(globalHeadersClient.todos.secure.fetch());

// should not make request keys optional from loose global headers
const looseGlobalHeadersClient = initClient(globalHeadersApi, {
	baseUrl: "https://example.test",
	getGlobalHeaders: (): Record<string, string> => ({
		authorization: "Bearer token",
	}),
});

expectError(looseGlobalHeadersClient.todos.search.fetch({}));
expectError(looseGlobalHeadersClient.todos.search.fetch({ search: "milk" }));
expectError(looseGlobalHeadersClient.todos.search.fetch());

// should type websocket send and receive message payloads
const websocketApi = router({
	todos: {
		socket: {
			method: "GET",
			path: "/todos/socket",
			mode: "webSocket",
			messages: {
				client: webSocketMessages("action", {
					echo: z.object({ text: z.string() }),
					count: z.object({
						value: z.string().transform((value) => Number(value)),
					}),
				}),
				server: {
					discriminator: "type",
					schemas: {
						ready: z.object({
							createdAt: z
								.string()
								.datetime()
								.transform((value) => new Date(value)),
						}),
						event: z.string(),
					},
				},
			},
		},
	},
});

const websocketClient = initClient(websocketApi, {
	baseUrl: "https://example.test",
});

const socket = websocketClient.todos.socket.openConnection();

socket.send({ action: "echo", message: { text: "hello" } });
socket.send({ action: "count", message: { value: "1" } });

expectError(socket.send({ action: "count", message: { value: 1 } }));
expectError(socket.send({ action: "missing", message: {} }));

socket.onMessage((message) => {
	if (message.type === "ready") {
		expectType<Date>(message.message.createdAt);
	} else {
		expectType<"event">(message.type);
		expectType<string>(message.message);
	}
});
