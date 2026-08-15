import { noBody, router } from "@rest-rpc/core";
import z from "zod";

const itemSchema = z.object({
	id: z.string(),
	title: z.string(),
});

export const nextFixtureContract = router({
	health: {
		method: "GET",
		path: "/api/health",
		responses: {
			204: noBody(),
		},
	},
	items: {
		get: {
			method: "GET",
			path: "/api/items/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: itemSchema,
			},
		},
		create: {
			method: "POST",
			path: "/api/items",
			body: z.object({ title: z.string() }),
			responses: {
				201: itemSchema,
			},
		},
	},
	targeted: {
		get: {
			method: "GET",
			path: "/api/targeted/items/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: itemSchema,
			},
		},
	},
});
