import { route } from "@rest-rpc/core";
import z from "zod";

const projectSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: z.enum(["active", "archived"]),
});

const projectEventSchema = z.object({
	id: z.string(),
	event: z.enum(["created", "renamed"]),
});

export const tanstackQueryContract = {
	projects: {
		list: route.get("/projects").response(
			200,
			z.object({
				projects: z.array(projectSchema),
				version: z.number(),
			}),
		),
		get: route
			.get("/projects/:id")
			.params(z.object({ id: z.string() }))
			.response(200, projectSchema)
			.response(
				404,
				z.object({
					code: z.literal("not_found"),
					id: z.string(),
				}),
			),
		search: route
			.get("/project-search")
			.query(
				z.object({
					q: z.string().optional(),
					status: z.enum(["active", "archived"]).optional(),
				}),
			)
			.response(
				200,
				z.object({
					projects: z.array(projectSchema),
				}),
			),
		create: route
			.post("/projects")
			.headers(z.object({ "x-test-tenant": z.string().optional() }))
			.body(
				z.object({
					name: z.string(),
					status: z.enum(["active", "archived"]).optional(),
				}),
			)
			.response(201, projectSchema.extend({ tenant: z.string().optional() })),
		rename: route
			.patch("/projects/:id")
			.params(z.object({ id: z.string() }))
			.body(z.object({ name: z.string() }))
			.response(200, projectSchema)
			.response(
				409,
				z.object({ code: z.literal("name_conflict"), name: z.string() }),
			),
		page: route
			.get("/project-page")
			.query(
				z.object({
					cursor: z.string().optional(),
					limit: z.coerce.number<number>(),
				}),
			)
			.response(
				200,
				z.object({
					projects: z.array(projectSchema),
					nextCursor: z.string().optional(),
				}),
			),
		slow: route
			.get("/slow-projects/:id")
			.params(z.object({ id: z.string() }))
			.response(200, projectSchema),
		events: route
			.get("/project-events")
			.streamResponse(200, projectEventSchema),
	},
} as const;

export type TanstackQueryContract = typeof tanstackQueryContract;
