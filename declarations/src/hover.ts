// Realistic library use, to hover in an editor when checking how public types
// display. Types that resolve to a readable shape should show it fully, without
// internal alias names. The declarations typecheck keeps this file compiling.
import {
	createClient,
	extractContract,
	route as contractRoute,
	safe,
	type InferClientError,
	type InferClientRequest,
	type InferClientResponse,
} from "@rest-rpc/core";
import {
	createLocalClient,
	implement,
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
	const created = await client.todos.create({ body: { title: "x" } });
	const inferred = await client.todos.inferred();
	const events = await client.todos.events();
	const { error, data } = await safe(
		client.todos.get({ params: { id: "1" }, query: { expand: true } }),
	);
	return { todo, created, inferred, events, error, data };
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

// Requests whose segments are all optional.
const optionalContract = {
	query: contractRoute
		.get("/query")
		.query(type<{ page?: number }>())
		.response({ status: 204 }),
	headers: contractRoute
		.get("/headers")
		.headers(type<{ "x-trace"?: string }>())
		.response({ status: 204 }),
	body: contractRoute
		.post("/body")
		.body(type<{ note?: string }>())
		.response({ status: 204 }),
	optionalBody: contractRoute
		.post("/optional-body")
		.body(type<string | undefined>())
		.response({ status: 204 }),
};
const optionalClient = createClient(optionalContract, { baseUrl: "" });
export const optionalQuery = optionalClient.query;
export const optionalHeaders = optionalClient.headers;
export const optionalFields = optionalClient.body;
export const optionalBody = optionalClient.optionalBody;
export const omitted = () =>
	Promise.all([
		optionalClient.query(),
		optionalClient.headers(),
		optionalClient.optionalBody(),
	]);

const implemented = implement(optionalContract);
export const implementedQuery = implemented.query.handler(
	({ query: implementedQueryValue }) => {
		void implementedQueryValue;
	},
);
