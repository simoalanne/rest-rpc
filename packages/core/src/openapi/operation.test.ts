import type { Contract } from "../contract/contract.ts";
import { route } from "../contract/routeBuilder.ts";
import { raw } from "../contract/raw.ts";
import { sse } from "../contract/sse.ts";
import { type } from "../standard-schema/type.ts";
import {
	createOpenApiDocument,
	type CreateOpenApiDocumentOptions,
} from "./document.ts";

// Documents a contract with one route and returns that route's operation.
const operationOf = (
	contract: Contract,
	options: Omit<CreateOpenApiDocumentOptions, "info"> = {},
) => {
	const { paths } = createOpenApiDocument(contract, {
		info: { title: "Test", version: "1" },
		...options,
	});
	const [pathItem] = Object.values(paths);
	return Object.values(pathItem!)[0]!;
};

describe("operation", () => {
	it("documents defined response descriptions, headers and content types", () => {
		const headers = type<{
			count: number;
			"content-type": "text/plain" | "application/json";
		}>();
		const body = type<string | { name: string }>();
		const converter = vi.fn((schema: unknown, _mode: "input" | "output") =>
			schema === headers
				? {
						properties: {
							count: { type: "integer", description: "Total count." },
							"content-type": { enum: ["text/plain", "application/json"] },
						},
						required: ["count"],
					}
				: { type: "string" },
		);
		const defined = route
			.get("/")
			.response(body, { headers, description: "Created" });
		expect(
			operationOf(defined, { schemaConverter: converter }).responses,
		).toEqual({
			200: {
				description: "Created",
				headers: {
					count: {
						description: "Total count.",
						required: true,
						schema: { type: "integer", description: "Total count." },
					},
				},
				content: {
					"text/plain": { schema: { type: "string" } },
					"application/json": { schema: { type: "string" } },
				},
			},
		});
	});

	it("documents defined errors grouped by status next to inferred responses", () => {
		const data = type<{ id: string }>();
		const headers = type<{ "retry-after": number }>();
		const defined = route
			.get("/")
			.error("NOT_FOUND", { status: 404, data, description: "Missing" })
			.error("GONE", { status: 404, headers, description: "Deleted" })
			.error("CONFLICT", { status: 409 });
		const converter = (schema: unknown) =>
			schema === headers
				? { properties: { "retry-after": { type: "integer" } } }
				: { type: "object" };
		const body = (code: string, extra = {}) => ({
			type: "object",
			properties: {
				code: { const: code },
				message: { type: "string" },
				...extra,
			},
			required: ["code", "message", ...Object.keys(extra)],
		});
		expect(
			operationOf(defined, { schemaConverter: converter }).responses,
		).toEqual({
			default: {
				description: expect.any(String),
			},
			404: {
				description: expect.stringMatching(/Missing[\s\S]*Deleted/),
				headers: { "retry-after": { schema: { type: "integer" } } },
				content: {
					"application/json": {
						schema: {
							oneOf: [
								body("NOT_FOUND", { data: { type: "object" } }),
								body("GONE"),
							],
						},
					},
				},
			},
			409: {
				content: { "application/json": { schema: body("CONFLICT") } },
			},
		});
	});

	it("documents a raw response as the default response with its description", () => {
		const legacy = route
			.get("/legacy")
			.response(raw({ description: "Legacy export" }));
		expect(operationOf(legacy).responses).toEqual({
			default: { description: "Legacy export" },
		});
	});

	it("falls back to empty schemas and the original operation when the hook returns undefined", () => {
		const defined = route
			.get("/")
			.query(type<{ q: string }>())
			.response(type<string>());
		const transformOperation = vi.fn(
			() => undefined,
		) as unknown as CreateOpenApiDocumentOptions["transformOperation"];
		expect(
			operationOf(defined, {
				schemaConverter: () => undefined,
				transformOperation,
			}),
		).toMatchObject({
			responses: { 200: { content: { "application/json": { schema: {} } } } },
		});
	});

	it("combines repeated parameter constraints and unions required query keys", () => {
		const first = type<{ id: string }>();
		const second = type<{ id: string; optional?: string }>();
		const params = type<{ id: string; optional: string }>();
		const schemaConverter = (schema: unknown) =>
			schema === first
				? { properties: { id: { type: "string" } }, required: ["id"] }
				: {
						properties: {
							id: { minLength: 1 },
							optional: { type: "string" },
						},
					};
		expect(
			operationOf(route.get("/").query(first).query(second), {
				schemaConverter,
			}).parameters,
		).toEqual([
			{
				name: "id",
				in: "query",
				required: true,
				schema: { allOf: [{ type: "string" }, { minLength: 1 }] },
			},
			{
				name: "optional",
				in: "query",
				required: false,
				schema: { type: "string" },
			},
		]);
		expect(
			operationOf(route.get("/:id/:optional").params(params), {
				schemaConverter,
			}).parameters?.map((parameter) => parameter.required),
		).toEqual([true, true]);
		const headers = type<{
			"x-version": string;
			accept: string;
			authorization: string;
		}>();
		expect(
			operationOf(route.get("/").headers(headers), {
				schemaConverter: () => ({
					properties: {
						"x-version": {
							type: "string",
							description: "API version.",
							deprecated: true,
						},
						accept: { type: "string" },
						authorization: { type: "string" },
					},
				}),
			}).parameters,
		).toEqual([
			{
				name: "x-version",
				in: "header",
				required: false,
				description: "API version.",
				deprecated: true,
				schema: {
					type: "string",
					description: "API version.",
					deprecated: true,
				},
			},
		]);
	});

	it("combines stacked request schemas under the content type the headers declare, or JSON and multipart", () => {
		const json = type<{ name: string }>();
		const headers = type<{ "content-type": "text/csv" }>();
		const converter = (schema: unknown) =>
			schema === headers
				? { properties: { "content-type": { const: "text/csv" } } }
				: { type: "object" };
		const stacked = route.post("/").body(json).body(json);
		expect(
			operationOf(stacked, { schemaConverter: converter }).requestBody?.content,
		).toEqual({
			"application/json": {
				schema: { allOf: [{ type: "object" }, { type: "object" }] },
			},
			"multipart/form-data": {
				schema: { allOf: [{ type: "object" }, { type: "object" }] },
			},
		});
		const csv = operationOf(route.post("/").headers(headers).body(json), {
			schemaConverter: converter,
		});
		expect(csv.requestBody?.content).toEqual({
			"text/csv": { schema: { type: "object" } },
		});
		// OpenAPI ignores a `content-type` header parameter.
		expect(csv.parameters).toBeUndefined();
		expect(operationOf(route.get("/")).requestBody).toBeUndefined();
	});

	it("documents defined request bodies as required", () => {
		const body = type<{ name: string }>();
		expect(operationOf(route.post("/").body(body)).requestBody?.required).toBe(
			true,
		);
	});

	it("omits content and descriptions a response doesn't have, and documents each event of a stream", () => {
		expect(
			operationOf(route.get("/").response({ status: 204 })).responses,
		).toEqual({ 204: {} });
		expect(
			operationOf(
				route
					.get("/")
					.response(sse(type<string>()), { description: "Updates" }),
				{ schemaConverter: () => ({ type: "string" }) },
			).responses,
		).toEqual({
			200: {
				description: "Updates",
				content: {
					"text/event-stream": {
						itemSchema: {
							type: "object",
							required: ["data"],
							properties: {
								data: {
									type: "string",
									contentMediaType: "application/json",
									contentSchema: { type: "string" },
								},
								event: { type: "string" },
								id: { type: "string" },
								retry: { type: "integer", minimum: 0 },
							},
						},
					},
				},
			},
		});
	});

	it("defaults the operation id to the key path and passes the operation and path into the hook", () => {
		const list = route
			.get("/users")
			.query(type<{ q: string }>())
			.response({ status: 204 });
		const transformOperation = vi.fn(({ operation }) => ({
			...operation,
			operationId: "listUsers",
		}));
		const operation = operationOf(
			{ users: { list } },
			{
				schemaConverter: () => ({ properties: { q: { type: "string" } } }),
				transformOperation,
			},
		);
		expect(operation.operationId).toBe("listUsers");
		expect(
			operationOf({ users: { list: list.openAPI({ operationId: "find" }) } })
				.operationId,
		).toBe("find");
		expect(
			operationOf({ users: { list: list.openAPI({ operationId: "" }) } }),
		).not.toHaveProperty("operationId");
		expect(transformOperation).toHaveBeenCalledWith({
			route: list["~restrpc"],
			routePath: ["users", "list"],
			operation: {
				operationId: "users.list",
				parameters: [
					{
						name: "q",
						in: "query",
						required: false,
						schema: { type: "string" },
					},
				],
				responses: { 204: {} },
			},
		});
	});

	it("documents every dynamic path segment, as a string when no schema converts it", () => {
		const asStrings = [
			{ name: "id", in: "path", required: true, schema: { type: "string" } },
			{ name: "slug", in: "path", required: true, schema: { type: "string" } },
		];
		const params = type<{ id: string; slug: string }>();
		expect(operationOf(route.get("/users/:id/posts/:slug")).parameters).toEqual(
			asStrings,
		);
		expect(
			operationOf(route.get("/users/:id/posts/:slug").params(params))
				.parameters,
		).toEqual(asStrings);
		expect(
			operationOf(route.get("/users/:id/posts/:slug").params(params), {
				schemaConverter: () => ({
					properties: { id: { type: "integer" }, other: { type: "string" } },
				}),
			}).parameters,
		).toEqual([
			{ name: "id", in: "path", required: true, schema: { type: "integer" } },
			asStrings[1],
		]);
	});

	it("documents query arrays the way they are sent", () => {
		const tags = { type: "array", items: { type: "string" } };
		const list = route.get("/").query(type<{ tags?: string[] }>());
		expect(
			operationOf(list, {
				schemaConverter: () => ({ type: "object", properties: { tags } }),
			}).parameters,
		).toEqual([
			{
				name: "tags[]",
				in: "query",
				required: false,
				style: "form",
				explode: true,
				schema: tags,
			},
		]);
	});
});
