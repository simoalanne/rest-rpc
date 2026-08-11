import { router } from "@rest-rpc/core/contract";
import z from "zod";

export const responsesContract = router({
	jsonContentType: {
		method: "GET",
		path: "/responses/json-content-type",
		responses: {
			200: z.object({ ok: z.literal(true) }),
		},
	},
	headers: {
		method: "GET",
		path: "/responses/headers",
		responses: {
			200: z.object({ ok: z.literal(true) }),
		},
	},
	undeclared: {
		method: "GET",
		path: "/responses/undeclared",
		responses: {
			200: z.object({ ok: z.literal(true) }),
		},
	},
	invalidDeclared: {
		method: "GET",
		path: "/responses/invalid-declared",
		responses: {
			200: z.object({ ok: z.boolean() }),
		},
	},
});

export type ResponsesContract = typeof responsesContract;
