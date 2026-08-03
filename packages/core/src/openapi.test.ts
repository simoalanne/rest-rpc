import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { stream } from "./contracts.ts";
import { createOpenApiDocument } from "./openapi.ts";

describe("createOpenApiDocument", () => {
	it("maps an API contract to OpenAPI paths, operations and schemas", () => {
		const apiContract = {
			todos: {
				update: {
					path: "/todos/:id",
					method: "POST",
					request: {
						params: z.object({ id: z.string() }),
						query: z.object({
							includeCompleted: z.coerce.boolean().optional(),
						}),
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
					meta: {
						auth: true,
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
					options: { mode: "websocket" },
					messages: {
						client: z.object({ type: z.literal("ping") }),
						server: z.object({ type: z.literal("pong") }),
					},
				},
			},
		} as const;

		const document = createOpenApiDocument(apiContract, {
			info: {
				title: "Todo API",
				version: "1.0.0",
			},
			servers: [{ url: "http://localhost:3000" }],
			transformOperation: ({ contract, operation }) => ({
				...operation,
				...(contract.meta?.auth ? { security: [{ bearerAuth: [] }] } : {}),
			}),
			transformDocument: (document) => ({
				...document,
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
						},
					},
				},
			}),
		});

		assert.equal(document.openapi, "3.1.0");
		assert.deepStrictEqual(Object.keys(document.paths).sort(), ["/todos/{id}"]);

		const updateOperation = document.paths["/todos/{id}"]?.post;
		assert.ok(updateOperation);
		assert.deepStrictEqual(updateOperation.security, [{ bearerAuth: [] }]);
		assert.deepStrictEqual(
			updateOperation.parameters?.map((parameter) => ({
				name: parameter.name,
				in: parameter.in,
				required: parameter.required,
			})),
			[
				{ name: "id", in: "path", required: true },
				{ name: "includeCompleted", in: "query", required: false },
			],
		);
		assert.equal(
			updateOperation.requestBody?.content["application/json"].schema.type,
			"object",
		);
		assert.equal(
			updateOperation.responses["202"].content?.["application/json"].schema
				.type,
			"object",
		);
		assert.equal(
			updateOperation.responses["409"].content?.["application/json"].schema
				.type,
			"object",
		);

		assert.deepStrictEqual(document.components, {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
				},
			},
		});
	});
});
