import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import {
	createOpenApiTestContract,
	schemaConverter,
} from "../../test/factories/openapi.ts";
import { noBody } from "../contract/route.ts";
import { createOpenApiDocument } from "./document.ts";

describe("createOpenApiDocument", () => {
	it("builds base document fields and applies document transforms", () => {
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
				transformDocument: (document) => ({
					...document,
					"x-generated-by": "rest-rpc",
				}),
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
		assert.equal(document["x-generated-by"], "rest-rpc");
	});

	it("groups multiple methods under the same OpenAPI path", () => {
		const document = createOpenApiDocument(
			{
				todos: {
					get: {
						path: "/todos/:id",
						method: "GET",
						request: {
							params: z.object({ id: z.string() }),
						},
						responses: {
							200: z.object({ id: z.string() }),
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
		const document = createOpenApiDocument(createOpenApiTestContract(), {
			info: {
				title: "Todo API",
				version: "1.0.0",
			},
			schemaConverter,
			transformOperation: ({ route, operation }) => ({
				...operation,
				operationId: `${route.method} ${route.path}`,
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
		assert.equal(updateOperation.operationId, "POST /todos/:id");
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
