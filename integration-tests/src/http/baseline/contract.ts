import { route } from "@rest-rpc/core";
import z from "zod";

const itemSchema = z.object({ id: z.string(), title: z.string() });
const echoedRequestSchema = z.object({
	params: z.record(z.string(), z.string()),
	query: z.record(z.string(), z.string()),
	headers: z.record(z.string(), z.string().optional()),
	body: z.unknown().optional(),
	context: z.object({ nonEmpty: z.literal(true) }),
});

export const integrationContract = {
	health: route.get("/health").response(204),
	echo: {
		json: route
			.post("/echo/json/:id")
			.params(z.object({ id: z.string() }))
			.query(
				z.object({
					search: z.string().optional(),
					limit: z.coerce.number<number>().optional(),
				}),
			)
			.headers(z.object({ "x-test-token": z.string().optional() }))
			.body(z.object({ title: z.string(), count: z.number() }))
			.response(200, echoedRequestSchema),
		text: route
			.post("/echo/text/:id")
			.params(z.object({ id: z.string() }))
			.customBody({ contentType: "text/plain", schema: z.string() })
			.customResponse(200, {
				contentType: "text/plain",
				schema: z.string(),
			}),
	},
	items: {
		list: route
			.get("/items")
			.query(
				z.object({
					search: z.string().optional(),
					empty: z.string().optional(),
				}),
			)
			.response(200, z.array(itemSchema)),
		get: route
			.get("/items/:id")
			.params(z.object({ id: z.string() }))
			.response(200, itemSchema)
			.response(
				404,
				z.object({ code: z.literal("not_found"), id: z.string() }),
			),
		create: route
			.post("/items")
			.body(z.object({ title: z.string() }))
			.response(201, itemSchema),
		publish: route
			.post("/items/:id/publish")
			.params(z.object({ id: z.string() }))
			.body(z.object({ async: z.boolean().optional() }))
			.response(200, itemSchema)
			.response(202, z.object({ queued: z.literal(true), id: z.string() })),
		remove: route
			.delete("/items/:id")
			.params(z.object({ id: z.string() }))
			.response(204),
	},
	responses: {
		binary: route.get("/responses/binary").customResponse(200, {
			contentType: "application/octet-stream",
			schema: z.instanceof(Uint8Array),
		}),
		headers: route.get("/responses/headers").response(200, {
			body: z.object({ ok: z.literal(true) }),
			headers: z.object({
				"x-declared-result": z.string(),
				"x-optional-result": z.string().optional(),
			}),
		}),
		text: route.get("/responses/text").customResponse(200, {
			contentType: "text/plain",
			schema: z.string(),
		}),
		undeclared: route
			.get("/responses/undeclared")
			.response(200, z.object({ ok: z.literal(true) })),
	},
	streams: {
		ndjson: route
			.get("/streams/ndjson")
			.streamResponse(200, z.object({ id: z.string(), index: z.number() })),
		text: route.get("/streams/text").customStreamResponse(200, {
			contentType: "text/plain",
			schema: z.string(),
		}),
	},
} as const;

export type IntegrationContract = typeof integrationContract;
