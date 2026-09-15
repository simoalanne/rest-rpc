import { route } from "@rest-rpc/core";
import z from "zod";

export const bodyParsingContract = {
	json: route
		.post("/body-parsing/json")
		.body(z.object({ count: z.number(), title: z.string() }))
		.response(200, z.object({ count: z.number(), title: z.string() })),
	text: route
		.post("/body-parsing/text")
		.body(z.string(), { contentType: "text/plain" })
		.response(200, z.object({ body: z.string() })),
	textVariant: route
		.post("/body-parsing/text-variant")
		.body(z.string(), { contentType: ["text/plain", "text/markdown"] })
		.response(200, z.object({ contentType: z.string(), body: z.string() })),
	customJson: route
		.post("/body-parsing/custom-json")
		.body(
			z.object({
				count: z.number(),
				nested: z.object({ ok: z.boolean() }),
			}),
			{ contentType: "application/json; charset=utf-8" },
		)
		.response(200, z.object({ count: z.number(), ok: z.boolean() })),
	formUrlEncoded: route
		.post("/body-parsing/form-url-encoded")
		.query(z.object({ filters: z.array(z.string()).optional() }))
		.body(
			z.object({
				count: z.coerce.number<number>(),
				title: z.string(),
				tags: z.array(z.string()).optional(),
			}),
			{ contentType: "application/x-www-form-urlencoded" },
		)
		.response(
			200,
			z.object({
				count: z.number(),
				title: z.string(),
				filters: z.array(z.string()).optional(),
				tags: z.array(z.string()).optional(),
			}),
		),
	binary: route
		.post("/body-parsing/binary")
		.body(z.instanceof(Uint8Array), {
			contentType: "application/octet-stream",
		})
		.response(
			200,
			z.object({ byteLength: z.number(), bytes: z.array(z.number()) }),
		),
	deleteNoBody: route.delete("/body-parsing/no-body").response(204),
} as const;

export type BodyParsingContract = typeof bodyParsingContract;
