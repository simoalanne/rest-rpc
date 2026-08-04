import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { customBody, noBody } from "../contract/route.ts";
import { schemaConverter } from "./factories.ts";
import {
	createOperation,
	createParameters,
	createRequestBody,
	createResponse,
} from "./operation.ts";
import type { OpenApiRouteDeclaration, SchemaConverter } from "./types.ts";

describe("OpenAPI operations", () => {
	it("creates required path params and schema-required query params", () => {
		const params = createParameters(
			z.object({ id: z.string().optional() }),
			"path",
			schemaConverter,
		);
		const query = createParameters(
			z.object({
				search: z.string(),
				includeCompleted: z.boolean().optional(),
			}),
			"query",
			schemaConverter,
		);

		assert.deepEqual(
			[...params, ...query].map((parameter) => ({
				name: parameter.name,
				in: parameter.in,
				required: parameter.required,
			})),
			[
				{ name: "id", in: "path", required: true },
				{ name: "search", in: "query", required: true },
				{ name: "includeCompleted", in: "query", required: false },
			],
		);
	});

	it("creates JSON and custom request bodies", () => {
		const jsonBody = createRequestBody(
			z.object({ title: z.string() }),
			schemaConverter,
		);
		const custom = createRequestBody(
			customBody({
				schema: z.string(),
				contentType: "text/csv",
			}),
			schemaConverter,
		);

		assert.equal(jsonBody?.content["application/json"].schema.type, "object");
		assert.equal(custom?.content["text/csv"].schema.type, "string");
	});

	it("creates no-body and JSON responses", () => {
		const empty = createResponse("Success", noBody, schemaConverter);
		const json = createResponse(
			"Error",
			z.object({ code: z.string() }),
			schemaConverter,
		);

		assert.deepEqual(empty, { description: "Success" });
		assert.equal(json.description, "Error");
		assert.equal(json.content?.["application/json"].schema.type, "object");
	});

	it("uses input schemas for requests and output schemas for responses", () => {
		const ios: string[] = [];
		const converter: SchemaConverter = (_schema, { io }) => {
			ios.push(io);
			return { type: "object", properties: {} };
		};
		const route: OpenApiRouteDeclaration = {
			path: "/todos/:id",
			method: "POST",
			request: {
				params: z.object({ id: z.string() }),
				body: z.object({ title: z.string() }),
			},
			responses: {
				201: z.object({ id: z.string() }),
			},
		};

		createOperation(route, {
			info: { title: "Todo API", version: "1.0.0" },
			schemaConverter: converter,
		});

		assert.deepEqual(ios, ["input", "input", "output"]);
	});

	it("applies operation transforms", () => {
		const route: OpenApiRouteDeclaration = {
			path: "/todos",
			method: "GET",
			responses: {
				204: noBody,
			},
		};

		const operation = createOperation(route, {
			info: { title: "Todo API", version: "1.0.0" },
			transformOperation: ({ route, operation }) => ({
				...operation,
				operationId: `${route.method} ${route.path}`,
			}),
		});

		assert.equal(operation.operationId, "GET /todos");
	});

	it("requires a schema converter only when schemas need conversion", () => {
		assert.doesNotThrow(() => createResponse("Success", noBody, undefined));
		assert.throws(
			() => createRequestBody(z.string(), undefined),
			/requires a schemaConverter option/,
		);
	});
});
