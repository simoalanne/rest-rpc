import { route } from "@rest-rpc/core";
import z from "zod";

export const requestValidationContract = {
	coerce: route
		.get("/request-validation/coerce/:id")
		.params(z.object({ id: z.coerce.number<number>() }))
		.query(
			z.object({
				published: z
					.enum(["true", "false"])
					.transform((value) => value === "true"),
			}),
		)
		.headers(z.object({ "x-page": z.string().pipe(z.coerce.number<string>()) }))
		.response(
			200,
			z.object({ id: z.number(), published: z.boolean(), page: z.number() }),
		),
	params: route
		.get("/request-validation/params/:id")
		.params(z.object({ id: z.number() }))
		.response(200, z.object({ reached: z.literal(true) })),
	query: route
		.get("/request-validation/query")
		.query(z.object({ page: z.number() }))
		.response(200, z.object({ reached: z.literal(true) })),
	headers: route
		.get("/request-validation/headers")
		.headers(z.object({ "x-required": z.string().min(1) }))
		.response(200, z.object({ reached: z.literal(true) })),
	body: route
		.post("/request-validation/body")
		.body(z.object({ count: z.number() }))
		.response(200, z.object({ reached: z.literal(true) })),
	emptyQuery: route
		.get("/request-validation/empty-query")
		.query(z.object({ value: z.literal("") }))
		.response(200, z.object({ value: z.literal("") })),
	jsonQuery: route
		.get("/request-validation/json-query")
		.jsonQuery(
			z.object({
				page: z.number(),
				includeArchived: z.boolean(),
				filters: z.object({ tags: z.array(z.string()) }),
			}),
		)
		.response(
			200,
			z.object({
				page: z.number(),
				includeArchived: z.boolean(),
				tags: z.array(z.string()),
			}),
		),
} as const;

export type RequestValidationContract = typeof requestValidationContract;
