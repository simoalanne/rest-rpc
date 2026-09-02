import { route } from "@rest-rpc/core";
import z from "zod";

const itemSchema = z.object({
	id: z.string(),
	title: z.string(),
});

export const nextFixtureContract = {
	health: route.get("/api/health").response(204),
	items: {
		get: route
			.get("/api/items/:id")
			.params(z.object({ id: z.string() }))
			.response(200, itemSchema),
		create: route
			.post("/api/items")
			.body(z.object({ title: z.string() }))
			.response(201, itemSchema),
	},
	targeted: {
		get: route
			.get("/api/targeted/items/:id")
			.params(z.object({ id: z.string() }))
			.response(200, itemSchema),
	},
} as const;
