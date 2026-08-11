import { customBody, noBody, router, stream } from "@rest-rpc/core/contract";
import z from "zod";

const itemSchema = z.object({
	id: z.string(),
	title: z.string(),
});

const echoedRequestSchema = z.object({
	params: z.record(z.string(), z.string()),
	query: z.record(z.string(), z.string()),
	headers: z.record(z.string(), z.string().optional()),
	body: z.unknown().optional(),
	context: z.object({
		nonEmpty: z.literal(true),
	}),
});

export const integrationContract = router({
	health: {
		method: "GET",
		path: "/health",
		responses: {
			204: noBody(),
		},
	},
	echo: {
		json: {
			method: "POST",
			path: "/echo/json/:id",
			request: {
				params: z.object({ id: z.string() }),
				query: z.object({
					search: z.string().optional(),
					limit: z.coerce.number().optional(),
				}),
				headers: {
					"x-test-token": z.string().optional(),
				},
				body: z.object({
					title: z.string(),
					count: z.number(),
				}),
			},
			responses: {
				200: echoedRequestSchema,
			},
		},
		text: {
			method: "POST",
			path: "/echo/text/:id",
			request: {
				params: z.object({ id: z.string() }),
				body: customBody({
					contentType: "text/plain",
					schema: z.string(),
				}),
			},
			responses: {
				200: customBody({
					contentType: "text/plain",
					schema: z.string(),
				}),
			},
		},
	},
	items: {
		list: {
			method: "GET",
			path: "/items",
			request: {
				query: z.object({
					search: z.string().optional(),
					empty: z.string().optional(),
				}),
			},
			responses: {
				200: z.array(itemSchema),
			},
		},
		get: {
			method: "GET",
			path: "/items/:id",
			request: {
				params: z.object({ id: z.string() }),
			},
			responses: {
				200: itemSchema,
				404: z.object({ code: z.literal("not_found"), id: z.string() }),
			},
		},
		create: {
			method: "POST",
			path: "/items",
			request: {
				body: z.object({ title: z.string() }),
			},
			responses: {
				201: itemSchema,
			},
		},
		publish: {
			method: "POST",
			path: "/items/:id/publish",
			request: {
				params: z.object({ id: z.string() }),
				body: z.object({ async: z.boolean().optional() }),
			},
			responses: {
				200: itemSchema,
				202: z.object({ queued: z.literal(true), id: z.string() }),
			},
		},
		remove: {
			method: "DELETE",
			path: "/items/:id",
			request: {
				params: z.object({ id: z.string() }),
			},
			responses: {
				204: noBody(),
			},
		},
	},
	responses: {
		headers: {
			method: "GET",
			path: "/responses/headers",
			responses: {
				200: z.object({ ok: z.literal(true) }),
			},
		},
		text: {
			method: "GET",
			path: "/responses/text",
			responses: {
				200: customBody({
					contentType: "text/plain",
					schema: z.string(),
				}),
			},
		},
		undeclared: {
			method: "GET",
			path: "/responses/undeclared",
			responses: {
				200: z.object({ ok: z.literal(true) }),
			},
		},
	},
	streams: {
		ndjson: {
			method: "GET",
			path: "/streams/ndjson",
			responses: {
				200: stream(z.object({ id: z.string(), index: z.number() })),
			},
		},
		text: {
			method: "GET",
			path: "/streams/text",
			responses: {
				200: stream(
					customBody({
						contentType: "text/plain",
						schema: z.string(),
					}),
				),
			},
		},
	},
});

export type IntegrationContract = typeof integrationContract;
