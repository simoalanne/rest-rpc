import { route } from "@rest-rpc/core";
import z from "zod";

export const bodyParsingContract = {
	json: route
		.post("/body-parsing/json")
		.body(z.object({ count: z.number(), title: z.string() }))
		.response(200, z.object({ count: z.number(), title: z.string() })),
	text: route
		.post("/body-parsing/text")
		.customBody({ contentType: "text/plain", schema: z.string() })
		.response(200, z.object({ body: z.string() })),
	textVariant: route
		.post("/body-parsing/text-variant")
		.customBody({
			contentType: ["text/plain", "text/markdown"],
			schema: z.string(),
		})
		.response(200, z.object({ contentType: z.string(), body: z.string() })),
	customJson: route
		.post("/body-parsing/custom-json")
		.customBody({
			contentType: "application/json; charset=utf-8",
			schema: z.object({
				count: z.number(),
				nested: z.object({ ok: z.boolean() }),
			}),
		})
		.response(200, z.object({ count: z.number(), ok: z.boolean() })),
	rawUrlEncoded: route
		.post("/body-parsing/raw-url-encoded")
		.customBody(z.instanceof(URLSearchParams))
		.response(
			200,
			z.object({ title: z.string(), remember: z.string().optional() }),
		),
	formUrlEncoded: route
		.post("/body-parsing/form-url-encoded")
		.formBody(z.object({ count: z.coerce.number<number>(), title: z.string() }))
		.response(200, z.object({ count: z.number(), title: z.string() })),
	binary: route
		.post("/body-parsing/binary")
		.customBody({
			contentType: "application/octet-stream",
			schema: z.instanceof(Uint8Array),
		})
		.response(
			200,
			z.object({ byteLength: z.number(), bytes: z.array(z.number()) }),
		),
	deleteNoBody: route.delete("/body-parsing/no-body").response(204),
} as const;

export type BodyParsingContract = typeof bodyParsingContract;
