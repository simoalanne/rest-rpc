import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { customBody, noBody, stream } from "../contract/body.ts";
import { router } from "../contract/contract.ts";
import { createOpenApiDocument } from "./document.ts";
import type { SchemaConverter } from "./operation.ts";

const schemaConverter: SchemaConverter = (schema, mode) =>
	z.toJSONSchema(schema as z.ZodType, {
		target: "openapi-3.0",
		io: mode,
		unrepresentable: "throw",
		reused: "inline",
	}) as Record<string, unknown>;

const openApiTestContract = router({
	todos: {
		list: {
			path: "/todos",
			method: "GET",
			query: z.object({
				search: z.string(),
				includeCompleted: z.boolean().optional(),
			}),
			responses: {
				200: z.array(z.object({ id: z.string(), title: z.string() })),
			},
		},
		update: {
			path: "/todos/:id",
			method: "POST",
			pathParams: z.object({ id: z.string() }),
			body: z.object({ title: z.string().min(1) }),
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
			pathParams: z.object({ id: z.string() }),
			responses: {
				204: noBody(),
			},
		},
		events: {
			path: "/todos/events",
			method: "GET",
			responses: {
				200: stream(
					z.object({
						type: z.string(),
					}),
				),
			},
		},
		socket: {
			path: "/todos/socket",
			method: "GET",
			mode: "webSocket",
			messages: {
				client: z.object({ type: z.literal("ping") }),
				server: z.object({ type: z.literal("pong") }),
			},
		},
		import: {
			path: "/todos/import",
			method: "POST",
			body: customBody({
				schema: z.string(),
				contentType: "text/csv",
			}),
			responses: {
				204: noBody(),
			},
		},
	},
});

describe("createOpenApiDocument", () => {
	it("builds base document fields", () => {
		const document = createOpenApiDocument(
			{
				health: {
					path: "/health",
					method: "GET",
					responses: {
						204: noBody(),
					},
				},
			},
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
					get: {
						path: "/todos/:id",
						method: "GET",
						pathParams: z.object({ id: z.string() }),
						responses: {
							200: z.object({ id: z.string() }),
						},
					},
					remove: {
						path: "/todos/:id",
						method: "DELETE",
						pathParams: z.object({ id: z.string() }),
						responses: {
							204: noBody(),
						},
					},
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
