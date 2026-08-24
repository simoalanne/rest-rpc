import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { schemaConverter } from "../../test/factories/openapi.ts";
import { customBody, formBody, noBody, stream } from "../contract/body.ts";
import { jsonQuery } from "../contract/request.ts";
import {
	createHeaderParameters,
	createOperation,
	createParameters,
	createRequestBody,
	createResponse,
} from "./operation.ts";
import type { OpenApiRouteDeclaration, SchemaConverter } from "./types.ts";

describe("OpenAPI operations", () => {
	it("creates required path params and schema-required query params", () => {
		const params = createParameters(
			z.object({ id: z.string() }),
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

	it("creates request parameters from schema records", () => {
		const params = createParameters(
			{ id: z.string() },
			"path",
			schemaConverter,
		);
		const query = createParameters(
			{
				search: z.string(),
				page: z.number().optional(),
			},
			"query",
			schemaConverter,
		);

		assert.deepEqual(
			[...params, ...query].map((parameter) => ({
				name: parameter.name,
				in: parameter.in,
				required: parameter.required,
				type: parameter.schema?.type,
			})),
			[
				{ name: "id", in: "path", required: true, type: "string" },
				{ name: "search", in: "query", required: true, type: "string" },
				{ name: "page", in: "query", required: false, type: "number" },
			],
		);
	});

	it("creates one JSON query parameter for jsonQuery schemas", () => {
		const parameters = createParameters(
			jsonQuery(
				z.object({
					page: z.number(),
					filters: z.object({ tags: z.array(z.string()) }),
				}),
			),
			"query",
			schemaConverter,
		);

		assert.deepEqual(parameters, [
			{
				name: "query",
				in: "query",
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								page: { type: "number" },
								filters: {
									type: "object",
									properties: {
										tags: {
											type: "array",
											items: { type: "string" },
										},
									},
									required: ["tags"],
								},
							},
							required: ["page", "filters"],
						},
					},
				},
			},
		]);
	});

	it("marks optional jsonQuery schemas as optional query parameters", () => {
		const parameters = createParameters(
			jsonQuery(z.object({ page: z.number() }).optional()),
			"query",
			schemaConverter,
		);

		assert.deepEqual(
			parameters.map((parameter) => ({
				name: parameter.name,
				in: parameter.in,
				required: parameter.required,
			})),
			[{ name: "query", in: "query", required: false }],
		);
	});

	it("rejects optional path params instead of documenting them as required", () => {
		assert.throws(
			() =>
				createParameters(
					z.object({ id: z.string().optional() }),
					"path",
					schemaConverter,
					"/todos/:id",
				),
			/path parameter "id" on \/todos\/:id must be required/,
		);
		assert.throws(
			() =>
				createParameters(
					{ id: z.string().optional() },
					"path",
					schemaConverter,
					"/todos/:id",
				),
			/path parameter "id" on \/todos\/:id must be required/,
		);
	});

	it("creates request header parameters", () => {
		const headers = createHeaderParameters(
			{
				"x-api-key": z.string(),
			},
			schemaConverter,
		);

		assert.deepEqual(headers, [
			{
				name: "x-api-key",
				in: "header",
				required: true,
				schema: {
					type: "string",
				},
			},
		]);
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

	it("creates custom request bodies with multiple declared content types", () => {
		const body = createRequestBody(
			customBody({
				schema: z.string(),
				contentType: ["image/png", "image/jpeg"],
			}),
			schemaConverter,
		);

		assert.equal(body?.content["image/png"].schema.type, "string");
		assert.equal(body?.content["image/jpeg"].schema.type, "string");
		assert.equal(body?.content["application/json"], undefined);
	});

	it("omits custom request bodies without declared content types", () => {
		const body = createRequestBody(customBody(z.string()), schemaConverter);

		assert.equal(body, undefined);
	});

	it("creates urlencoded form request bodies", () => {
		const body = createRequestBody(
			formBody(
				z.object({
					title: z.string(),
				}),
			),
			schemaConverter,
		);

		assert.equal(
			body?.content["application/x-www-form-urlencoded"].schema.type,
			"object",
		);
		assert.equal(body?.content["application/json"], undefined);
	});

	it("creates JSON request bodies from schema records", () => {
		const body = createRequestBody(
			{
				title: z.string(),
				priority: z.number().optional(),
			},
			schemaConverter,
		);

		assert.deepEqual(body, {
			required: true,
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							title: { type: "string" },
							priority: { type: "number" },
						},
						required: ["title"],
					},
				},
			},
		});
	});

	it("omits explicit no-body request bodies", () => {
		assert.equal(createRequestBody(noBody(), schemaConverter), undefined);
	});

	it("creates no-body and JSON responses", () => {
		const empty = createResponse("", noBody(), schemaConverter);
		const json = createResponse(
			"",
			z.object({ code: z.string() }),
			schemaConverter,
		);

		assert.deepEqual(empty, { description: "" });
		assert.equal(json.description, "");
		assert.equal(json.content?.["application/json"].schema.type, "object");
	});

	it("creates declared response headers", () => {
		const response = createResponse(
			"Created.",
			{
				body: z.object({ id: z.string() }),
				headers: {
					location: z.string(),
					"x-next-cursor": z.string().optional(),
				},
			},
			schemaConverter,
		);

		assert.deepEqual(response.headers, {
			location: {
				schema: {
					type: "string",
				},
			},
			"x-next-cursor": {
				schema: {
					type: "string",
				},
			},
		});
		assert.equal(response.content?.["application/json"].schema.type, "object");
	});

	it("creates declared headers for no-body responses", () => {
		const response = createResponse(
			"",
			{
				body: noBody(),
				headers: {
					location: z.string(),
				},
			},
			schemaConverter,
		);

		assert.deepEqual(response, {
			description: "",
			headers: {
				location: {
					schema: {
						type: "string",
					},
				},
			},
		});
	});

	it("creates OpenAPI-only response headers", () => {
		const response = createResponse(
			"",
			z.object({ id: z.string() }),
			schemaConverter,
			{
				description: "Todo returned.",
				headers: {
					"x-request-id": {
						description: "Request correlation id.",
						schema: z.string(),
					},
					"x-rate-limit": z.number(),
				},
			},
		);

		assert.equal(response.description, "Todo returned.");
		assert.deepEqual(response.headers, {
			"x-request-id": {
				description: "Request correlation id.",
				schema: {
					type: "string",
				},
			},
			"x-rate-limit": {
				schema: {
					type: "number",
				},
			},
		});
	});

	it("lets declared response headers override OpenAPI-only response headers", () => {
		const response = createResponse(
			"",
			{
				body: z.object({ id: z.string() }),
				headers: {
					etag: z.string(),
				},
			},
			schemaConverter,
			{
				headers: {
					etag: {
						description: "Generated by middleware.",
						schema: z.number(),
					},
				},
			},
		);

		assert.deepEqual(response.headers?.etag, {
			schema: {
				type: "string",
			},
		});
	});

	it("skips OpenAPI response metadata for undeclared statuses", () => {
		const operation = createOperation(
			{
				path: "/todos",
				method: "GET",
				openApi: {
					responses: {
						200: {
							description: "Todos returned.",
						},
						401: {
							description: "Authentication is required.",
						},
					},
				},
				responses: {
					200: z.array(z.object({ id: z.string() })),
				},
			},
			{
				info: { title: "Todo API", version: "1.0.0" },
				schemaConverter,
			},
		);

		assert.deepEqual(Object.keys(operation.responses), ["200"]);
		assert.equal(operation.responses["200"].description, "Todos returned.");
	});

	it("creates custom responses with declared content types", () => {
		const response = createResponse(
			"",
			customBody({
				contentType: "text/csv",
				schema: z.string(),
			}),
			schemaConverter,
		);

		assert.equal(response.content?.["text/csv"].schema?.type, "string");
		assert.equal(response.content?.["application/json"], undefined);
	});

	it("creates custom responses with multiple declared content types", () => {
		const response = createResponse(
			"",
			customBody({
				contentType: ["image/png", "image/jpeg"],
				schema: z.string(),
			}),
			schemaConverter,
		);

		assert.equal(response.content?.["image/png"].schema?.type, "string");
		assert.equal(response.content?.["image/jpeg"].schema?.type, "string");
	});

	it("creates NDJSON stream responses as text wire bodies", () => {
		const response = createResponse(
			"",
			stream(z.object({ id: z.string() })),
			schemaConverter,
		);

		assert.deepEqual(response.content?.["application/x-ndjson"].schema, {
			type: "string",
		});
	});

	it("creates custom stream responses with wire-level schemas", () => {
		const csv = createResponse(
			"",
			stream(
				customBody({
					contentType: "text/csv",
					schema: z.number(),
				}),
			),
			schemaConverter,
		);
		const binary = createResponse(
			"",
			stream(
				customBody({
					contentType: "application/octet-stream",
					schema: z.number(),
				}),
			),
			schemaConverter,
		);

		assert.deepEqual(csv.content?.["text/csv"].schema, { type: "string" });
		assert.deepEqual(binary.content?.["application/octet-stream"].schema, {
			type: "string",
			format: "binary",
		});
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
			pathParams: { id: z.string() },
			headers: { "x-api-key": z.string() },
			body: { title: z.string() },
			responses: {
				201: z.object({ id: z.string() }),
			},
		};

		createOperation(route, {
			info: { title: "Todo API", version: "1.0.0" },
			schemaConverter: converter,
		});

		assert.deepEqual(ios, ["input", "input", "input", "output"]);
	});

	it("applies operation transforms", () => {
		const route: OpenApiRouteDeclaration = {
			path: "/todos",
			method: "GET",
			responses: {
				204: noBody(),
			},
		};

		const operation = createOperation(route, {
			info: { title: "Todo API", version: "1.0.0" },
			schemaConverter,
			transformOperation: ({ route, operation }) => ({
				...operation,
				operationId: `${route.method} ${route.path}`,
			}),
		});

		assert.equal(operation.operationId, "GET /todos");
	});

	it("applies explicit route OpenAPI options", () => {
		const route: OpenApiRouteDeclaration = {
			path: "/todos",
			method: "GET",
			openApi: {
				summary: "List todos",
				description: "Returns visible todos.",
				operationId: "listTodos",
				tags: ["Todos"],
				deprecated: true,
				security: [{ bearerAuth: [] }],
				externalDocs: { url: "https://example.com/docs/todos" },
				responses: {
					200: {
						description: "Todos returned.",
					},
				},
				extensions: {
					"x-feature": "todos",
				},
			},
			responses: {
				200: z.array(z.object({ id: z.string() })),
			},
		};

		const operation = createOperation(route, {
			info: { title: "Todo API", version: "1.0.0" },
			schemaConverter,
		});

		assert.equal(operation.summary, "List todos");
		assert.equal(operation.description, "Returns visible todos.");
		assert.equal(operation.operationId, "listTodos");
		assert.deepEqual(operation.tags, ["Todos"]);
		assert.equal(operation.deprecated, true);
		assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
		assert.deepEqual(operation.externalDocs, {
			url: "https://example.com/docs/todos",
		});
		assert.equal(operation.responses["200"].description, "Todos returned.");
		assert.equal(operation["x-feature"], "todos");
	});

	it("omits explicit no-body responses after receiving the required converter", () => {
		assert.deepEqual(createResponse("", noBody(), schemaConverter), {
			description: "",
		});
	});
});
