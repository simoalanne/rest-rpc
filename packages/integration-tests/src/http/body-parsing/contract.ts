import { customBody, noBody, router } from "@rest-rpc/core/contract";
import z from "zod";

export const bodyParsingContract = router({
	json: {
		method: "POST",
		path: "/body-parsing/json",
		request: {
			body: z.object({
				count: z.number(),
				title: z.string(),
			}),
		},
		responses: {
			200: z.object({
				count: z.number(),
				title: z.string(),
			}),
		},
	},
	text: {
		method: "POST",
		path: "/body-parsing/text",
		request: {
			body: customBody({
				contentType: "text/plain",
				schema: z.string(),
			}),
		},
		responses: {
			200: z.object({
				body: z.string(),
			}),
		},
	},
	customJson: {
		method: "POST",
		path: "/body-parsing/custom-json",
		request: {
			body: customBody({
				contentType: "application/json; charset=utf-8",
				schema: z.object({
					count: z.number(),
					nested: z.object({
						ok: z.boolean(),
					}),
				}),
			}),
		},
		responses: {
			200: z.object({
				count: z.number(),
				ok: z.boolean(),
			}),
		},
	},
	binary: {
		method: "POST",
		path: "/body-parsing/binary",
		request: {
			body: customBody({
				contentType: "application/octet-stream",
				schema: z.instanceof(Uint8Array),
			}),
		},
		responses: {
			200: z.object({
				byteLength: z.number(),
				bytes: z.array(z.number()),
			}),
		},
	},
	deleteNoBody: {
		method: "DELETE",
		path: "/body-parsing/no-body",
		request: {
			body: noBody(),
		},
		responses: {
			204: noBody(),
		},
	},
});

export type BodyParsingContract = typeof bodyParsingContract;
