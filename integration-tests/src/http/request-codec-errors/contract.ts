import { route } from "@rest-rpc/core";
import z from "zod";

const documentSchema = z.object({ count: z.number(), title: z.string() });

export const requestCodecErrorsContract = {
	json: route
		.post("/request-codec-errors/json")
		.body(documentSchema)
		.response(200, documentSchema),
	text: route
		.post("/request-codec-errors/text")
		.body(z.string(), {
			contentType: ["text/plain", "text/markdown"],
		})
		.response(204),
	binary: route
		.post("/request-codec-errors/binary")
		.body(z.instanceof(Blob), {
			contentType: "application/octet-stream",
		})
		.response(204),
	noBody: route.delete("/request-codec-errors/no-body").response(204),
} as const;
