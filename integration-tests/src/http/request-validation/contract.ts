import { jsonQuery, router } from "@rest-rpc/core/contract";
import z from "zod";

export const requestValidationContract = router({
	coerce: {
		method: "GET",
		path: "/request-validation/coerce/:id",
		pathParams: z.object({ id: z.coerce.number() }),
		query: z.object({
			published: z
				.enum(["true", "false"])
				.transform((value) => value === "true"),
		}),
		headers: {
			"x-page": z.string().pipe(z.coerce.number()),
		},
		responses: {
			200: z.object({
				id: z.number(),
				published: z.boolean(),
				page: z.number(),
			}),
		},
	},
	params: {
		method: "GET",
		path: "/request-validation/params/:id",
		pathParams: z.object({ id: z.number() }),
		responses: {
			200: z.object({ reached: z.literal(true) }),
		},
	},
	query: {
		method: "GET",
		path: "/request-validation/query",
		query: z.object({ page: z.number() }),
		responses: {
			200: z.object({ reached: z.literal(true) }),
		},
	},
	headers: {
		method: "GET",
		path: "/request-validation/headers",
		headers: {
			"x-required": z.string().min(1),
		},
		responses: {
			200: z.object({ reached: z.literal(true) }),
		},
	},
	body: {
		method: "POST",
		path: "/request-validation/body",
		body: z.object({
			count: z.number(),
		}),
		responses: {
			200: z.object({ reached: z.literal(true) }),
		},
	},
	emptyQuery: {
		method: "GET",
		path: "/request-validation/empty-query",
		query: z.object({
			value: z.literal(""),
		}),
		responses: {
			200: z.object({ value: z.literal("") }),
		},
	},
	jsonQuery: {
		method: "GET",
		path: "/request-validation/json-query",
		query: jsonQuery(
			z.object({
				page: z.number(),
				includeArchived: z.boolean(),
				filters: z.object({
					tags: z.array(z.string()),
				}),
			}),
		),
		responses: {
			200: z.object({
				page: z.number(),
				includeArchived: z.boolean(),
				tags: z.array(z.string()),
			}),
		},
	},
});

export type RequestValidationContract = typeof requestValidationContract;
