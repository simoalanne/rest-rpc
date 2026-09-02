import { route } from "@rest-rpc/core";
import z from "zod";

export const upstreamContract = {
	counter: {
		get: route
			.get("/counter/:id")
			.params(z.object({ id: z.string() }))
			.response(
				200,
				z.object({
					id: z.string(),
					count: z.number(),
				}),
			),
	},
} as const;
