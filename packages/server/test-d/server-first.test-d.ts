import { route as coreRoute } from "@rest-rpc/core";
import type { SseRouteHandlerContext } from "@rest-rpc/server";
import {
	implement as serverImplement,
	serverFirstRoute,
	type Implement,
	type ServerImplementationTree,
	type ServerRouteFactory,
} from "@rest-rpc/server";
import { sseEvent } from "@rest-rpc/server";
import { expectAssignable, expectError, expectType } from "tsd";
import { z } from "zod";

interface ApplicationContext {
	todos: {
		find(id: string): { id: string; title: string };
	};
	prefix: string;
	count: number;
	name: string;
	value: string;
}

const route = serverFirstRoute as unknown as ServerRouteFactory<
	{ flattenRequestKeys: true },
	ApplicationContext
>;
const implement = serverImplement as Implement<ApplicationContext>;

const todoInput = z.object({ title: z.string() });
const todo = z.object({ id: z.string(), title: z.string() });

// server-first builders preserve core request methods, flatten request segments,
// and retain literal methods and paths through handler attachment
const create = route
	.post("/todos")
	.body(todoInput)
	.handler(({ title, context }) => {
		expectType<string>(title);
		expectType<ApplicationContext & { signal: AbortSignal }>(context);
		expectType<AbortSignal>(context.signal);

		return {
			status: 201,
			body: { id: "todo-1", title },
		};
	});

expectType<"POST">(create.route.method);
expectType<"/todos">(create.route.path);
expectType<201>(
	create.handler({
		title: "write tests",
		context: {
			signal: new AbortController().signal,
			todos: { find: () => ({ id: "todo-1", title: "todo" }) },
			prefix: "",
			count: 0,
			name: "",
			value: "",
		},
	}).status,
);

// declared responses remain authoritative on the server-first builder
const declaredCreate = route
	.post("/declared-todos")
	.body(todoInput)
	.response(201, todo)
	.handler((request) => {
		const { title, context } = request;
		expectType<string>(title);
		expectType<
			ApplicationContext & { signal: AbortSignal } & Record<string, unknown>
		>(context);
		expectType<AbortSignal>(context.signal);
		expectError(request.signal);

		return {
			status: 201,
			body: { id: "todo-1", title },
		};
	});

expectError(
	route
		.get("/invalid-declared-response")
		.response(200, todo)
		.handler(() => ({ status: 404 as const, body: { code: "NOT_FOUND" } })),
);

// configured factories preserve prefixes and may opt out of flattened keys
const prefixed = route
	.with({
		pathPrefix: "/v1",
		flattenRequestKeys: false,
		metadata: { apiVersion: "v1", access: "shared" },
	})
	.post("/todos")
	.body(todoInput)
	.withMetadata({ access: "write", feature: "todos" })
	.handler(({ body }) => {
		expectType<{ title: string }>(body);
		return { status: 204 as const };
	});

expectType<"/v1/todos">(prefixed.route.path);
expectType<{
	readonly apiVersion: "v1";
	readonly access: "write";
	readonly feature: "todos";
}>(prefixed.route.metadata);

const contract = {
	todos: {
		get: coreRoute
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(200, todo),
		create: coreRoute.post("/todos").body(todoInput).response(201, todo),
	},
} as const;

// contract-first attachment mirrors trees and preserves the contract's request shape
const get = implement(contract).todos.get.handler(({ id, context }) => {
	expectType<string>(id);
	expectType<
		ApplicationContext & { signal: AbortSignal } & Record<string, unknown>
	>(context);
	expectType<AbortSignal>(context.signal);
	return { status: 200 as const, body: context.todos.find(id) };
});

const contractCreate = implement(contract.todos.create).handler((request) => {
	const { title, context } = request;
	expectType<string>(title);
	expectType<
		ApplicationContext & { signal: AbortSignal } & Record<string, unknown>
	>(context);
	expectType<AbortSignal>(context.signal);
	expectError(request.signal);
	return { status: 201 as const, body: { id: "todo-1", title } };
});

expectType<typeof contract.todos.get>(get.route);
expectType<typeof contract.todos.create>(contractCreate.route);
expectError(
	implement(contract.todos.get).handler(() => ({
		status: 404 as const,
		body: { code: "NOT_FOUND" },
	})),
);

// HTTP and SSE implementations compose as ordinary nested objects
const events = route
	.sse("/todos/events")
	.response(todo)
	.handler(async function* ({ context }) {
		expectType<
			ApplicationContext & { signal: AbortSignal } & Record<string, unknown> &
				SseRouteHandlerContext
		>(context);
		expectType<AbortSignal>(context.signal);
		yield sseEvent(context.todos.find("todo-1"));
	});

const routes = {
	todos: { create, declaredCreate, get, contractCreate, events },
};

expectType<"/todos/events">(events.route.path);
expectAssignable<ServerImplementationTree>(routes);

// the general server-first construction model intentionally excludes WebSockets
const socket = coreRoute
	.ws("/socket")
	.clientMessage("ping", z.string())
	.serverMessage("pong", z.string());
expectError(implement(socket));
