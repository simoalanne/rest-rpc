import type { ExecutionContext } from "@nestjs/common";
import {
	route as defineRoute,
	router as defineRouter,
	type as schemaType,
} from "@rest-rpc/core/contract";
import {
	RestRpcModule,
	Route,
	type RouteHandler,
	type RouteHandlers,
	type RouteRequest,
	Router,
	route,
	router,
} from "@rest-rpc/nest";
import type { Request } from "express";
import { expectAssignable, expectType } from "tsd";

type AppContext = {
	request: Request;
	userId: string;
};

declare module "@rest-rpc/nest" {
	interface DefaultNestContext extends AppContext {}
}

const todoSchema = schemaType<{ id: string; title: string; userId: string }>();

const api = defineRouter({
	todos: {
		get: defineRoute({
			method: "GET",
			path: "/todos/:id",
			pathParams: {
				id: schemaType<string>(),
			},
			responses: {
				200: todoSchema,
			},
		}),
	},
});

// should expose augmented default context and adapter signal to route handlers
type GetTodoRequest = RouteRequest<typeof api.todos.get>;
declare const getTodoRequest: GetTodoRequest;
expectType<string>(getTodoRequest.id);
expectType<string>(getTodoRequest.context.userId);
expectType<Request>(getTodoRequest.context.request);
expectAssignable<AbortSignal>(getTodoRequest.context.signal);

const getTodoHandler: RouteHandler<typeof api.todos.get> = ({
	id,
	context,
}) => {
	expectType<string>(id);
	expectType<string>(context.userId);
	expectType<Request>(context.request);
	expectAssignable<AbortSignal>(context.signal);

	return {
		id,
		title: "Typed todo",
		userId: context.userId,
	};
};

// should preserve server route implementation types through Nest helpers
const getTodoImplementation = route(api.todos.get, getTodoHandler);
expectType<typeof api.todos.get>(getTodoImplementation.route);

const todoImplementations = router(api.todos, {
	get: getTodoHandler,
} satisfies RouteHandlers<typeof api.todos>);
expectType<typeof api.todos.get>(todoImplementations.get.route);

// passing context to route handlers should not infer route-local handler context.
router(
	api.todos,
	{
		get: ({ id, context }) => {
			expectType<unknown>(context.tenant);

			return {
				id,
				title: "Typed todo",
				userId: context.userId,
			};
		},
	} satisfies RouteHandlers<typeof api.todos>,
	{
		context: {
			tenant: "tenant-1",
		},
	},
);

route(
	api.todos.get,
	({ id, context }) => {
		expectType<unknown>(context.tenant);

		return {
			id,
			title: "Typed todo",
			userId: context.userId,
		};
	},
	{
		context: {
			tenant: "tenant-1",
		},
	},
);

route<typeof api.todos.get, { tenant: string }>(
	api.todos.get,
	({ id, context }) => {
		expectType<string>(context.userId);
		expectType<Request>(context.request);
		expectType<string>(context.tenant);
		expectAssignable<AbortSignal>(context.signal);

		return {
			id,
			title: "Typed todo",
			userId: context.userId,
		};
	},
);

class TenantTodoHandlers implements RouteHandlers<typeof api.todos> {
	get({ id, context }: RouteRequest<typeof api.todos.get, { tenant: string }>) {
		expectType<string>(context.userId);
		expectType<Request>(context.request);
		expectType<string>(context.tenant);
		expectAssignable<AbortSignal>(context.signal);

		return {
			id,
			title: "Typed todo",
			userId: context.userId,
		};
	}
}
expectAssignable<RouteHandlers<typeof api.todos>>(new TenantTodoHandlers());

// should expose Nest decorators and module context typing
expectAssignable<MethodDecorator>(Route(api.todos.get));
expectAssignable<MethodDecorator>(Router(api.todos));

RestRpcModule.forRoot({
	createContext: (context) => {
		expectType<ExecutionContext>(context);
		const req = context.switchToHttp().getRequest<Request>();

		return {
			request: req,
			userId: "user-1",
		};
	},
});
