import { router } from "@rest-rpc/core";
import z from "zod";

export const upstreamContract = router({
	counter: {
		get: {
			method: "GET",
			path: "/counter/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: z.object({
					id: z.string(),
					count: z.number(),
				}),
			},
		},
	},
});
