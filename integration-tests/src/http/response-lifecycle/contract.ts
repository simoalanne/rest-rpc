import { route } from "@rest-rpc/core";
import z from "zod";

export const responseLifecycleContract = {
	jsonContentType: route
		.get("/response-lifecycle/json-content-type")
		.response(200, z.object({ ok: z.literal(true) }), {
			headers: z.object({ "content-type": z.string() }),
		}),
} as const;
