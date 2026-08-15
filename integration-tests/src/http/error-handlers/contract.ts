import { router } from "@rest-rpc/core/contract";
import z from "zod";

export const errorHandlersContract = router({
	validation: {
		method: "GET",
		path: "/error-handlers/validation",
		query: z.object({
			page: z.number(),
		}),
		responses: {
			200: z.object({ reached: z.literal(true) }),
		},
	},
	unhandled: {
		method: "GET",
		path: "/error-handlers/unhandled",
		responses: {
			200: z.object({ reached: z.literal(true) }),
		},
	},
	contractResponse: {
		method: "GET",
		path: "/error-handlers/contract-response",
		responses: {
			200: z.object({ reached: z.literal(true) }),
			409: z.object({
				code: z.literal("conflict"),
				source: z.literal("contract-response-error"),
			}),
		},
	},
	hookState: {
		method: "GET",
		path: "/error-handlers/hook-state",
		responses: {
			200: z.object({
				validationErrors: z.number(),
				unhandledErrors: z.number(),
			}),
		},
	},
});

export type ErrorHandlersContract = typeof errorHandlersContract;
