import { route } from "@rest-rpc/core";
import z from "zod";

export const responseValidationContract = {
	invalidDeclared: route
		.get("/response-validation/invalid-declared")
		.response(200, z.object({ ok: z.boolean() })),
} as const;
