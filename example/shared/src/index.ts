import type {
	InferRouteClientMessage,
	InferRouteErrors,
	InferRouteRequest,
	InferRouteResponse,
	InferRouteServerMessage,
	InferRouteSuccessBody,
	InferRouteSuccessResponse,
} from "@contract-first-api/core";
import { customBody, router, stream } from "@contract-first-api/core";
import { type } from "arktype";
import * as v from "valibot";
import z from "zod";

export const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
	createdAt: z.string(),
});

export const todoEventSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("created"),
		todo: todoSchema,
		message: z.string(),
	}),
	z.object({
		type: z.literal("completed"),
		id: z.string(),
		message: z.string(),
	}),
	z.object({
		type: z.literal("renamed"),
		id: z.string(),
		title: z.string(),
		message: z.string(),
	}),
]);

export const discussMessageSchema = z.object({
	id: z.string(),
	author: z.string(),
	text: z.string(),
	createdAt: z.string(),
});

export const discussClientMessageSchema = z.object({
	type: z.literal("message"),
	author: z.string().min(1).trim(),
	text: z.string().min(1).trim(),
});

export const discussServerMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("history"),
		messages: z.array(discussMessageSchema),
	}),
	z.object({
		type: z.literal("message"),
		message: discussMessageSchema,
	}),
]);

export const healthContract = router({
	health: {
		get: {
			method: "GET",
			path: "/health",
			responses: {
				200: v.object({
					status: v.literal("ok"),
					requestId: v.string(),
				}),
			},
		},
	},
});

export const todoContract = router({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			responses: {
				200: z.object({
					items: z.array(todoSchema),
				}),
			},
		},
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: v.object({
					title: v.pipe(v.string(), v.minLength(1)),
				}),
			},
			metadata: { auth: "required" },
			responses: {
				201: todoSchema,
				202: z.object({
					requestId: z.string(),
				}),
				409: z.object({
					code: z.literal("TITLE_ALREADY_EXISTS"),
				}),
			},
		},
		find: {
			method: "POST",
			path: "/todos/find",
			request: {
				body: type({
					query: "string",
				}),
			},
			responses: {
				200: z.array(todoSchema),
			},
		},
		events: {
			method: "GET",
			path: "/todos/events",
			responses: {
				200: stream(todoEventSchema),
			},
		},
	},
});

export const discussContract = router({
	discuss: {
		connect: {
			method: "GET",
			path: "/discuss",
			options: { mode: "websocket" },
			messages: {
				client: discussClientMessageSchema,
				server: discussServerMessageSchema,
			},
		},
	},
});

export const imageContract = router({
	images: {
		inspect: {
			method: "POST",
			path: "/images/inspect",
			request: {
				body: customBody({
					schema: z.custom<Blob | Uint8Array>(
						(value) => value instanceof Blob || value instanceof Uint8Array,
					),
					contentType: "application/octet-stream",
				}),
			},
			responses: {
				200: type({
					width: "number",
					height: "number",
				}),
			},
		},
	},
});

export const apiContract = {
	...healthContract,
	...todoContract,
	...discussContract,
	...imageContract,
};

router(apiContract, { pathPrefix: "/api" });

export type ExampleContract = typeof apiContract;
export type HealthResponse = InferRouteResponse<typeof apiContract.health.get>;
export type HealthSuccessResponse = InferRouteSuccessResponse<
	typeof apiContract.health.get
>;
export type ListTodosResponse = InferRouteResponse<
	typeof apiContract.todos.list
>;
export type ListTodosBody = InferRouteSuccessBody<
	typeof apiContract.todos.list
>;
export type CreateTodoRequest = InferRouteRequest<
	typeof apiContract.todos.create
>;
export type CreateTodoErrors = InferRouteErrors<
	typeof apiContract.todos.create
>;
export type Todo = z.infer<typeof todoSchema>;
export type TodoEvent = z.infer<typeof todoEventSchema>;
export type FindTodosRequest = InferRouteRequest<typeof apiContract.todos.find>;
export type FindTodosResponse = InferRouteResponse<
	typeof apiContract.todos.find
>;
export type DiscussMessage = z.infer<typeof discussMessageSchema>;
export type DiscussClientMessage = InferRouteClientMessage<
	typeof apiContract.discuss.connect
>;
export type DiscussServerMessage = InferRouteServerMessage<
	typeof apiContract.discuss.connect
>;
export type InspectImageResponse = InferRouteResponse<
	typeof apiContract.images.inspect
>;
