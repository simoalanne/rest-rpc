import type {
	ContractApiRequest,
	ContractApiResponse,
	DotPaths,
} from "@contract-first-api/core";
import { initContracts } from "@contract-first-api/core";
import z from "zod";

export type ExampleContractMeta = {
	requiresAuth?: boolean;
	auditLabel?: string;
	reactQuery?: {
		safe: boolean;
	};
};

const { defineContract, mergeContracts } = initContracts<ExampleContractMeta>();

export const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
	createdAt: z.string(),
});

export const healthContract = defineContract({
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

export const todoContracts = defineContract({
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
			meta: {
				reactQuery: {
					safe: true,
				},
			},
			response: z.array(todoSchema),
		},
	},
});

export const allContracts = mergeContracts(healthContract, todoContracts);

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

export type HealthResponse = ApiResponse<"health.get">;
export type ListTodosResponse = ApiResponse<"todos.list">;
export type CreateTodoRequest = ApiRequest<"todos.create">;
export type Todo = ApiResponse<"todos.create">;
export type FindTodosRequest = ApiRequest<"todos.find">;
export type FindTodosResponse = ApiResponse<"todos.find">;
