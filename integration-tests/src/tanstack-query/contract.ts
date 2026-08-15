import { router } from "@rest-rpc/core/contract";
import z from "zod";

const projectSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.enum(["active", "archived"]),
});

export const tanstackQueryContract = router({
	projects: {
		list: {
			method: "GET",
			path: "/projects",
			responses: {
				200: z.object({
					projects: z.array(projectSchema),
					version: z.number(),
				}),
			},
		},
		get: {
			method: "GET",
			path: "/projects/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: projectSchema,
				404: z.object({
					code: z.literal("not_found"),
					id: z.string(),
				}),
			},
		},
		search: {
			method: "GET",
			path: "/project-search",
			query: z.object({
				q: z.string().optional(),
				status: z.enum(["active", "archived"]).optional(),
			}),
			responses: {
				200: z.object({
					projects: z.array(projectSchema),
				}),
			},
		},
		create: {
			method: "POST",
			path: "/projects",
			headers: {
				"x-test-tenant": z.string().optional(),
			},
			body: z.object({
				name: z.string(),
				status: z.enum(["active", "archived"]).optional(),
			}),
			responses: {
				201: projectSchema.extend({
					tenant: z.string().optional(),
				}),
			},
		},
		rename: {
			method: "PATCH",
			path: "/projects/:id",
			pathParams: z.object({ id: z.string() }),
			body: z.object({ name: z.string() }),
			responses: {
				200: projectSchema,
				409: z.object({
					code: z.literal("name_conflict"),
					name: z.string(),
				}),
			},
		},
		page: {
			method: "GET",
			path: "/project-page",
			query: z.object({
				cursor: z.string().optional(),
				limit: z.coerce.number(),
			}),
			responses: {
				200: z.object({
					projects: z.array(projectSchema),
					nextCursor: z.string().optional(),
				}),
			},
		},
		slow: {
			method: "GET",
			path: "/slow-projects/:id",
			pathParams: z.object({ id: z.string() }),
			responses: {
				200: projectSchema,
			},
		},
	},
});

export type TanstackQueryContract = typeof tanstackQueryContract;
