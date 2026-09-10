import { route } from "@rest-rpc/core";
import z from "zod";

export const responsesContract = {
	jsonContentType: route.get("/responses/json-content-type").response(200, {
		body: z.object({ ok: z.literal(true) }),
		headers: z.object({ "content-type": z.string() }),
	}),
	invalidDeclared: route
		.get("/responses/invalid-declared")
		.response(200, z.object({ ok: z.boolean() })),
} as const;

export type ResponsesContract = typeof responsesContract;
