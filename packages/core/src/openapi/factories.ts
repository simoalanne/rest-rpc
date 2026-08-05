import z from "zod";
import { customBody, noBody, streamBody } from "../contract/route.ts";
import type { SchemaConverter } from "./types.ts";

export const schemaConverter: SchemaConverter = (schema, { io }) =>
	z.toJSONSchema(schema as z.ZodType, {
		target: "openapi-3.0",
		io,
		unrepresentable: "throw",
		reused: "inline",
	}) as Record<string, unknown>;

export const createOpenApiTestContract = () =>
	({
		todos: {
			list: {
				path: "/todos",
				method: "GET",
				request: {
					query: z.object({
						search: z.string(),
						includeCompleted: z.boolean().optional(),
					}),
				},
				responses: {
					200: z.array(z.object({ id: z.string(), title: z.string() })),
				},
			},
			update: {
				path: "/todos/:id",
				method: "POST",
				request: {
					params: z.object({ id: z.string() }),
					body: z.object({ title: z.string().min(1) }),
				},
				responses: {
					202: z.object({
						id: z.string(),
						title: z.string(),
					}),
					409: z.object({
						code: z.literal("TITLE_ALREADY_EXISTS"),
					}),
				},
			},
			remove: {
				path: "/todos/:id",
				method: "DELETE",
				request: {
					params: z.object({ id: z.string() }),
				},
				responses: {
					204: noBody(),
				},
			},
			events: {
				path: "/todos/events",
				method: "GET",
				responses: {
					200: streamBody(
						z.object({
							type: z.string(),
						}),
					),
				},
			},
			socket: {
				path: "/todos/socket",
				method: "GET",
				options: { mode: "websocket" },
				messages: {
					client: z.object({ type: z.literal("ping") }),
					server: z.object({ type: z.literal("pong") }),
				},
			},
			import: {
				path: "/todos/import",
				method: "POST",
				request: {
					body: customBody({
						schema: z.string(),
						contentType: "text/csv",
					}),
				},
				responses: {
					204: noBody(),
				},
			},
		},
	}) as const;
