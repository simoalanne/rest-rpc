import { route } from "@rest-rpc/core";
import z from "zod";

export const errorHandlersContract = {
	validation: route
		.get("/error-handlers/validation")
		.query(z.object({ page: z.number() }))
		.response(200, z.object({ reached: z.literal(true) })),
	unhandled: route
		.get("/error-handlers/unhandled")
		.response(200, z.object({ reached: z.literal(true) })),
	hookState: route
		.get("/error-handlers/hook-state")
		.response(
			200,
			z.object({ validationErrors: z.number(), unhandledErrors: z.number() }),
		),
} as const;

export type ErrorHandlersContract = typeof errorHandlersContract;
