// Realistic library use, to hover in an editor when checking how public types
// display. Types that resolve to a readable shape should show it fully, without
// internal alias names. The declarations typecheck keeps this file compiling.
import {
	createClient,
	extractContract,
	safe,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
} from "@rest-rpc/core";
import {
	createLocalClient,
	route,
	routeError,
	sse,
	type,
	type InferServerRequest,
} from "@rest-rpc/server";
import { createTanstackQueryUtils } from "@rest-rpc/tanstack-query";

const TodoNotFound = routeError("TODO_NOT_FOUND", {
	status: 404,
	data: type<{ id: string }>(),
});

type Todo = { id: string; title: string; done: boolean };

const routes = {
	todos: {
		get: route
			.get("/todos/:id")
			.$context<{ user: string }>()
			.query(type<{ expand: boolean }>())
			.headers(type<{ "x-tenant": string }>())
			.response(type<Todo>())
			.error(TodoNotFound)
			.handler((request) => {
				const { params, query, headers, context, errors, respond } = request;
				if (context.user === "") throw errors.TODO_NOT_FOUND({ data: params });
				return respond(
					{ id: params.id, title: headers["x-tenant"], done: query.expand },
					{ status: 200 },
				);
			}),
		create: route
			.post("/todos")
			.body(type<{ title: string }>())
			.response(type<Todo>(), { status: 201 })
			.response({ status: 204 })
			.handler(({ body, respond }) =>
				respond({ id: "1", title: body.title, done: false }, { status: 201 }),
			),
		inferred: route.get("/inferred").handler(() => ({ ok: true })),
		events: route
			.get("/events")
			.response(sse(type<{ n: number }>()))
			.handler(async function* () {
				yield { n: 1 };
			}),
	},
};

const contract = extractContract(routes);
const client = createClient(contract, {
	baseUrl: "",
	globalHeaders: { "x-tenant": "a" },
});
export const getTodo = client.todos.get;
export const createTodo = client.todos.create;

export const useClient = async () => {
	const todo = await client.todos.get({
		params: { id: "1" },
		query: { expand: true },
	});
	const inferred = await client.todos.inferred();
	const events = await client.todos.events();
	const { error, data } = await safe(
		client.todos.get({ params: { id: "1" }, query: { expand: true } }),
	);
	return { todo, inferred, events, error, data };
};

export type ClientRequest = InferClientRequest<typeof client.todos.get>;
export type ClientResponse = InferClientResponse<typeof client.todos.get>;
export type ClientError = InferClientError<typeof client.todos.get>;
export type ServerRequest = InferServerRequest<typeof routes.todos.get>;

const local = createLocalClient(routes);
export const localGet = local.todos.get;

const utils = createTanstackQueryUtils(client);
export const queryOptions = utils.todos.get.queryOptions({
	request: { params: { id: "1" }, query: { expand: true } },
});
export const mutationOptions = utils.todos.create.mutationOptions();
export const queryKey = utils.todos.get.queryKey();
