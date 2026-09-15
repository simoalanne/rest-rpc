import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as createRoute } from "../contract/routeBuilder.ts";
import z from "zod";
import {
	createHeaderParameters,
	createOperation,
	createParameters,
	createRequestBody,
	createResponse,
} from "./operation.ts";
import type { SchemaConverter } from "./operation.ts";
import type { RouteDeclaration } from "../contract/routeDeclaration.ts";

const schemaConverter: SchemaConverter = (schema, mode) =>
	z.toJSONSchema(schema as z.ZodType, {
		target: "openapi-3.0",
		io: mode,
		unrepresentable: "throw",
		reused: "inline",
	}) as Record<string, unknown>;
const operationOptions = { schemaConverter };

describe("OpenAPI operations", () => {
	it("creates required path params and schema-required query params", () => {
		const params = createParameters(
			z.object({ id: z.string() }),
			"path",
			operationOptions,
		);
		const query = createParameters(
			z.object({
				search: z.string(),
				includeCompleted: z.boolean().optional(),
			}),
			"query",
			operationOptions,
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

	it("creates path params as required and query params from object schemas", () => {
		const params = createParameters(
			z.object({ id: z.string() }),
			"path",
			operationOptions,
		);
		const query = createParameters(
			z.object({ search: z.string(), page: z.number().optional() }),
			"query",
			operationOptions,
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

	it("documents object-schema path params as required", () => {
		const parameters = createParameters(
			z.object({ id: z.string().optional() }),
			"path",
			operationOptions,
		);

		assert.deepEqual(
			parameters.map((parameter) => ({
				name: parameter.name,
				in: parameter.in,
				required: parameter.required,
			})),
			[{ name: "id", in: "path", required: true }],
		);
	});

	it("documents object-schema path params as required", () => {
		const parameters = createParameters(
			z.object({ id: z.string().optional() }),
			"path",
			operationOptions,
		);

		assert.deepEqual(
			parameters.map((parameter) => ({
				name: parameter.name,
				in: parameter.in,
				required: parameter.required,
			})),
			[{ name: "id", in: "path", required: true }],
		);
	});

	it("applies parameter transforms", () => {
		const route: RouteDeclaration = createRoute
			.get("/todos/:id")
			.params(z.object({ id: z.string() }))
			.query(
				z.object({
					search: z
						.string()
						.min(1)
						.meta({ openApi: { required: true } }),
					cursor: z
						.string()
						.optional()
						.meta({ openApi: { required: false } }),
				}),
			)
			.headers(
				z.object({
					"x-preview": z
						.literal("1")
						.optional()
						.meta({ openApi: { required: false } }),
				}),
			)
			.response(200, z.array(z.object({ id: z.string() })))["~restrpc"];

		const operation = createOperation(
			route,
			{
				info: { title: "Todo API", version: "1.0.0" },
				schemaConverter,
				transformParameter: ({ route, routePath, parameter }) => {
					const metadata = parameter.schema as
						| { openApi?: { required?: boolean } }
						| undefined;
					const required = metadata?.openApi?.required;

					return {
						...parameter,
						"x-route-path": route.path,
						"x-contract-path": routePath.join("."),
						...(typeof required === "boolean" ? { required } : {}),
					};
				},
			},
			["todos", "list"],
		);

		assert.deepEqual(
			operation.parameters?.map((parameter) => ({
				name: parameter.name,
				in: parameter.in,
				required: parameter.required,
				routePath: parameter["x-route-path"],
				contractPath: parameter["x-contract-path"],
			})),
			[
				{
					name: "id",
					in: "path",
					required: true,
					routePath: "/todos/:id",
					contractPath: "todos.list",
				},
				{
					name: "search",
					in: "query",
					required: true,
					routePath: "/todos/:id",
					contractPath: "todos.list",
				},
				{
					name: "cursor",
					in: "query",
					required: false,
					routePath: "/todos/:id",
					contractPath: "todos.list",
				},
				{
					name: "x-preview",
					in: "header",
					required: false,
					routePath: "/todos/:id",
					contractPath: "todos.list",
				},
			],
		);
	});

	it("creates request header parameters", () => {
		const headers = createHeaderParameters(
			{
				inherited: z.object({
					"x-api-key": z.string(),
					"x-shared": z.string(),
				}),
				local: z.object({
					"x-request-id": z.string().optional(),
					"x-shared": z.number(),
				}),
			},
			operationOptions,
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
			{
				name: "x-shared",
				in: "header",
				required: true,
				schema: {
					type: "number",
				},
			},
			{
				name: "x-request-id",
				in: "header",
				required: false,
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
		const custom = createRequestBody(z.string(), schemaConverter, "text/csv");

		assert.equal(jsonBody?.content["application/json"].schema.type, "object");
		assert.equal(custom?.content["text/csv"].schema.type, "string");
	});

	it("uses empty OpenAPI schemas when conversion is unavailable", () => {
		const withoutConverter = createRequestBody(z.string(), undefined);
		const withoutConvertedSchema = createRequestBody(
			z.string(),
			() => undefined,
		);

		assert.deepEqual(withoutConverter?.content["application/json"], {
			schema: {},
		});
		assert.deepEqual(withoutConvertedSchema?.content["application/json"], {
			schema: {},
		});
	});

	it("creates custom request bodies with multiple declared content types", () => {
		const body = createRequestBody(z.string(), schemaConverter, [
			"image/png",
			"image/jpeg",
		]);

		assert.equal(body?.content["image/png"].schema.type, "string");
		assert.equal(body?.content["image/jpeg"].schema.type, "string");
		assert.equal(body?.content["application/json"], undefined);
	});

	it("creates urlencoded form request bodies", () => {
		const body = createRequestBody(
			z.object({ title: z.string() }),
			schemaConverter,
			"application/x-www-form-urlencoded",
		);

		assert.equal(
			body?.content["application/x-www-form-urlencoded"].schema.type,
			"object",
		);
		assert.equal(body?.content["application/json"], undefined);
	});

	it("creates multipart request bodies", () => {
		const body = createRequestBody(
			z.object({ title: z.string(), file: z.string() }),
			schemaConverter,
			"multipart/form-data",
		);

		assert.equal(body?.content["multipart/form-data"].schema.type, "object");
		assert.equal(body?.content["application/json"], undefined);
	});

	it("creates JSON request bodies from object schemas", () => {
		const body = createRequestBody(
			z.object({
				title: z.string(),
				priority: z.number().optional(),
			}),
			schemaConverter,
		);

		assert.deepEqual(body, {
			content: {
				"application/json": {
					schema: {
						type: "object",
						required: ["title"],
						properties: {
							title: { type: "string" },
							priority: { type: "number" },
						},
					},
				},
			},
		});
	});

	it("omits absent request bodies", () => {
		assert.equal(createRequestBody(undefined, schemaConverter), undefined);
	});

	it("creates no-body and JSON responses", () => {
		const empty = createResponse("", { body: undefined }, schemaConverter);
		const json = createResponse(
			"",
			{ body: z.object({ code: z.string() }) },
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
				headers: z.object({
					location: z.string(),
					"x-next-cursor": z.string().optional(),
				}),
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
				body: undefined,
				headers: z.object({ location: z.string() }),
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
			{ body: z.object({ id: z.string() }) },
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
				headers: z.object({ etag: z.string() }),
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
			createRoute
				.get("/todos")
				.openAPI({
					responses: {
						200: {
							description: "Todos returned.",
						},
						401: {
							description: "Authentication is required.",
						},
					},
				})
				.response(200, z.array(z.object({ id: z.string() })))["~restrpc"],
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
			{
				contentType: "text/csv",
				body: z.string(),
			},
			schemaConverter,
		);

		assert.equal(response.content?.["text/csv"].schema?.type, "string");
		assert.equal(response.content?.["application/json"], undefined);
	});

	it("creates custom responses with multiple declared content types", () => {
		const response = createResponse(
			"",
			{
				contentType: ["image/png", "image/jpeg"],
				body: z.string(),
			},
			schemaConverter,
		);

		assert.equal(response.content?.["image/png"].schema?.type, "string");
		assert.equal(response.content?.["image/jpeg"].schema?.type, "string");
	});

	it("creates NDJSON stream responses as text wire bodies", () => {
		const response = createResponse(
			"",
			{
				kind: "stream",
				body: z.object({ id: z.string() }),
			},
			schemaConverter,
		);

		assert.deepEqual(response.content?.["application/x-ndjson"].schema, {
			type: "string",
		});
	});

	it("treats an ordinary NDJSON content type as custom content", () => {
		const response = createResponse(
			"",
			{
				body: z.object({ id: z.string() }),
				contentType: "application/x-ndjson",
			},
			schemaConverter,
		);

		assert.equal(
			response.content?.["application/x-ndjson"].schema?.type,
			"object",
		);
	});

	it("uses input schemas for requests and output schemas for responses", () => {
		const modes: string[] = [];
		const converter: SchemaConverter = (_schema, mode) => {
			modes.push(mode);
			return { type: "object", properties: {} };
		};
		const route: RouteDeclaration = createRoute
			.post("/todos/:id")
			.params(z.object({ id: z.string() }))
			.headers(z.object({ "x-api-key": z.string() }))
			.body(z.object({ title: z.string() }))
			.response(201, z.object({ id: z.string() }))["~restrpc"];

		createOperation(route, {
			info: { title: "Todo API", version: "1.0.0" },
			schemaConverter: converter,
		});

		assert.deepEqual(modes, ["input", "input", "input", "output"]);
	});

	it("applies operation transforms", () => {
		const route: RouteDeclaration = createRoute.get("/todos").response(204)[
			"~restrpc"
		];

		const operation = createOperation(
			route,
			{
				info: { title: "Todo API", version: "1.0.0" },
				schemaConverter,
				transformOperation: ({ route, routePath, operation }) => ({
					...operation,
					operationId: `${routePath.join(".")} ${route.method} ${route.path}`,
				}),
			},
			["todos", "list"],
		);

		assert.equal(operation.operationId, "todos.list GET /todos");
	});

	it("applies explicit route OpenAPI options", () => {
		const route: RouteDeclaration = createRoute
			.get("/todos")
			.openAPI({
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
			})
			.response(200, z.array(z.object({ id: z.string() })))["~restrpc"];

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
		assert.deepEqual(createResponse("", { body: undefined }, schemaConverter), {
			description: "",
		});
	});
});
