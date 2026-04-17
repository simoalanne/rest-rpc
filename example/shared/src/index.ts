import type {
	ContractApiRequest,
	ContractApiResponse,
	DotPaths,
} from "@contract-first-api/core";
import { initContracts } from "@contract-first-api/core";
import z from "zod";

const { defineContract } = initContracts();

export const todoSchema = z.object({
	id: z.string(),
	title: z.string(),
	createdAt: z.string(),
});

export const contracts = defineContract({
	health: {
		get: {
			method: "GET",
			path: "/health",
			response: z.object({
				status: z.literal("ok"),
				requestId: z.string(),
			}),
		},
	},
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
			request: {
				body: z.object({
					title: z.string().min(1),
				}),
			},
			response: todoSchema,
		},
	},
});

export type ExampleContracts = typeof contracts;
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
