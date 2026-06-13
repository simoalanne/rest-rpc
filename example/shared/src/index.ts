import type {
	ContractApiError,
	ContractApiRequest,
	ContractApiResponse,
	DotPaths,
} from "@contract-first-api/core";
import { initContracts } from "@contract-first-api/core";
import z from "zod";

export type ExampleContractMeta = {
	requiresAuth?: boolean;
	auditLabel?: string;
};

const { defineContractTree } = initContracts<ExampleContractMeta>();

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

export const healthContract = defineContractTree({
	health: {
		get: {
			method: "GET",
			path: "/health",
			meta: {
				auditLabel: "health.get",
			},
			response: z.object({
				status: z.literal("ok"),
				requestId: z.string(),
			}),
		},
	},
});

export const todoContracts = defineContractTree({
	todos: {
		list: {
			method: "GET",
			path: "/todos",
			response: z.object({
				items: z.array(todoSchema),
			}),
		},
		create: {
			method: "POST",
			path: "/todos",
			meta: {
				requiresAuth: true,
				auditLabel: "todos.create",
			},
			request: {
				body: z.object({
					title: z.string().min(1),
				}),
			},
			errors: z.object({
				code: z.literal("TITLE_ALREADY_EXISTS"),
			}),
			response: todoSchema,
		},
		find: {
			method: "POST",
			path: "/todos/find",
			request: {
				body: z.object({
					query: z.string().min(1),
				}),
			},
			response: z.array(todoSchema),
		},
		events: {
			method: "GET",
			path: "/todos/events",
			response: todoEventSchema,
			options: { mode: "stream" },
		},
	},
});

export const discussContracts = defineContractTree({
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

export const imageContracts = defineContractTree({
	images: {
		inspect: {
			method: "POST",
			path: "/images/inspect",
			options: { mode: "raw" },
			response: z.object({
				width: z.number(),
				height: z.number(),
			}),
		},
	},
});

export const allContracts = {
	...healthContract,
	...todoContracts,
	...discussContracts,
	...imageContracts,
};

export type ExampleContracts = typeof allContracts;
export type ApiPath = DotPaths<ExampleContracts>;

export type ApiRequest<P extends ApiPath> = ContractApiRequest<
	ExampleContracts,
	P
>;

export type ApiResponse<P extends ApiPath> = ContractApiResponse<
	ExampleContracts,
	P
>;

export type ApiError<P extends ApiPath> = ContractApiError<ExampleContracts, P>;

export type HealthResponse = ApiResponse<"health.get">;
export type ListTodosResponse = ApiResponse<"todos.list">;
export type CreateTodoRequest = ApiRequest<"todos.create">;
export type Todo = ApiResponse<"todos.create">;
export type TodoEvent = z.infer<typeof todoEventSchema>;
export type FindTodosRequest = ApiRequest<"todos.find">;
export type FindTodosResponse = ApiResponse<"todos.find">;
export type DiscussMessage = z.infer<typeof discussMessageSchema>;
export type DiscussClientMessage = z.infer<typeof discussClientMessageSchema>;
export type DiscussServerMessage = z.infer<typeof discussServerMessageSchema>;
export type InspectImageResponse = ApiResponse<"images.inspect">;
