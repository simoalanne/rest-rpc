import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { route } from "../contract/routeFactory.ts";
import { createOpenApiDocument } from "./document.ts";
import type { SchemaConverter } from "./operation.ts";

const schemaConverter: SchemaConverter = (schema, mode) =>
	z.toJSONSchema(schema as z.ZodType, {
		target: "openapi-3.0",
		io: mode,
		unrepresentable: "throw",
		reused: "inline",
	}) as Record<string, unknown>;

const openApiTestContract = {
	todos: {
		list: route
			.get("/todos")
			.query(
				z.object({
					search: z.string(),
					includeCompleted: z.boolean().optional(),
				}),
			)
			.response(200, z.array(z.object({ id: z.string(), title: z.string() }))),
		update: route
			.post("/todos/:id")
			.params(z.object({ id: z.string() }))
			.body(z.object({ title: z.string().min(1) }))
			.response(
				202,
				z.object({
					id: z.string(),
					title: z.string(),
				}),
			)
			.response(
				409,
				z.object({
					code: z.literal("TITLE_ALREADY_EXISTS"),
				}),
			),
		remove: route
			.delete("/todos/:id")
			.params(z.object({ id: z.string() }))
			.response(204),
		events: route.get("/todos/events").streamResponse(
			200,
			z.object({
				type: z.string(),
			}),
		),
		socket: route
			.ws("/todos/socket")
			.clientMessage("ping", z.object({ type: z.literal("ping") }))
			.serverMessage("pong", z.object({ type: z.literal("pong") })),
		import: route
			.post("/todos/import")
			.customBody({
				schema: z.string(),
				contentType: "text/csv",
			})
			.response(204),
	},
};

describe("createOpenApiDocument", () => {
	it("builds base document fields", () => {
		const document = createOpenApiDocument(
			{ health: route.get("/health").response(204) },
			{
				openapi: "3.0.3",
				info: {
					title: "Todo API",
					version: "1.0.0",
				},
				servers: [{ url: "http://localhost:3000" }],
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
						},
					},
				},
				tags: [{ name: "todos" }],
				schemaConverter,
			},
		);

		assert.equal(document.openapi, "3.0.3");
		assert.deepEqual(document.info, {
			title: "Todo API",
			version: "1.0.0",
		});
		assert.deepEqual(document.servers, [{ url: "http://localhost:3000" }]);
		assert.deepEqual(document.tags, [{ name: "todos" }]);
		assert.deepEqual(document.components, {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
				},
			},
		});
	});

	it("groups multiple methods under the same OpenAPI path", () => {
		const document = createOpenApiDocument(
			{
				todos: {
					get: route
						.get("/todos/:id")
						.params(z.object({ id: z.string() }))
						.response(200, z.object({ id: z.string() })),
					remove: route
						.delete("/todos/:id")
						.params(z.object({ id: z.string() }))
						.response(204),
				},
			},
			{
				info: { title: "Todo API", version: "1.0.0" },
				schemaConverter,
			},
		);

		assert.ok(document.paths["/todos/{id}"]?.get);
		assert.ok(document.paths["/todos/{id}"]?.delete);
	});

	it("maps a representative API contract to paths, operations and schemas", () => {
		const document = createOpenApiDocument(openApiTestContract, {
			info: {
				title: "Todo API",
				version: "1.0.0",
			},
			schemaConverter,
			transformOperation: ({ routePath, operation }) => ({
				...operation,
				operationId: routePath.join("."),
			}),
		});

		assert.equal(document.openapi, "3.1.0");
		assert.deepEqual(Object.keys(document.paths).sort(), [
			"/todos",
			"/todos/events",
			"/todos/import",
			"/todos/{id}",
		]);

		const updateOperation = document.paths["/todos/{id}"]?.post;
		assert.ok(updateOperation);
		assert.equal(updateOperation.operationId, "todos.update");
		assert.equal(
			updateOperation.requestBody?.content["application/json"].schema.type,
			"object",
		);
		assert.equal(
			updateOperation.responses["202"].content?.["application/json"].schema
				.type,
			"object",
		);

		const importOperation = document.paths["/todos/import"]?.post;
		assert.ok(importOperation);
		assert.equal(
			importOperation.requestBody?.content["text/csv"].schema.type,
			"string",
		);

		const eventsOperation = document.paths["/todos/events"]?.get;
		assert.ok(eventsOperation);
		assert.deepEqual(
			eventsOperation.responses["200"].content?.["application/x-ndjson"].schema,
			{ type: "string" },
		);
	});
});
