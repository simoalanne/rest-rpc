import { route } from "@rest-rpc/core";
import z from "zod";

export const responsesContract = {
	jsonContentType: route
		.get("/responses/json-content-type")
		.response(200, z.object({ ok: z.literal(true) })),
	headers: route
		.get("/responses/headers")
		.response(200, z.object({ ok: z.literal(true) })),
	cookies: {
		issue: route
			.get("/responses/cookies/issue")
			.response(200, z.object({ ok: z.literal(true) })),
		read: route
			.get("/responses/cookies/read")
			.headers(z.object({ cookie: z.string().optional() }))
			.response(200, z.object({ cookie: z.string().nullable() })),
	},
	undeclared: route
		.get("/responses/undeclared")
		.response(200, z.object({ ok: z.literal(true) })),
	invalidDeclared: route
		.get("/responses/invalid-declared")
		.response(200, z.object({ ok: z.boolean() })),
} as const;

export type ResponsesContract = typeof responsesContract;
