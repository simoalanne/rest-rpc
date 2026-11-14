import type { Contract } from "../contract/contract.ts";
import { route } from "../contract/routeBuilder.ts";
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
		const headers = type<{ count: number }>();
		const text = type<string>();
		const json = type<{ name: string }>();
		const converter = vi.fn((schema: unknown, _mode: "input" | "output") =>
			schema === headers
				? { properties: { count: { type: "integer" } } }
				: schema === json
					? { type: "object" }
					: { type: "string" },
		);
		const defined = route
			.get("/")
			.response(
				{ "text/plain": text, "application/json": json },
				{ headers, description: "Created" },
			);
		expect(
			operationOf(defined, { schemaConverter: converter }).responses,
		).toEqual({
			200: {
				description: "Created",
				headers: { count: { schema: { type: "integer" } } },
				content: {
					"text/plain": { schema: { type: "string" } },
					"application/json": { schema: { type: "object" } },
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
				description:
					"Response inferred from the route handler; not documented.",
			},
			404: {
				description: "Missing\nDeleted",
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
				description: "",
				content: { "application/json": { schema: body("CONFLICT") } },
			},
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
	});

	it("combines stacked request schemas per media type", () => {
		const json = type<{ name: string }>();
		const defined = route
			.post("/")
			.body({ "text/plain": type<string>(), "application/json": json })
			.body(json);
		expect(
			operationOf(defined, {
				schemaConverter: (schema) =>
					schema === json ? { type: "object" } : { type: "string" },
			}).requestBody?.content,
		).toEqual({
			"text/plain": { schema: { type: "string" } },
			"application/json": {
				schema: { allOf: [{ type: "object" }, { type: "object" }] },
			},
		});
		expect(operationOf(route.get("/")).requestBody).toBeUndefined();
	});

	it("omits content for bodyless responses and uses SSE for streams", () => {
		expect(
			operationOf(route.get("/").response({ status: 204 })).responses,
		).toEqual({ 204: { description: "" } });
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
				content: { "text/event-stream": { schema: { type: "string" } } },
			},
		});
	});

	it("passes the generated operation and contract path into the operation hook", () => {
		const list = route
			.get("/users")
			.query(type<{ q: string }>())
			.response({ status: 204 });
		const transformOperation = vi.fn(({ operation }) => ({
			...operation,
			operationId: "users.list",
		}));
		const operation = operationOf(
			{ users: { list } },
			{
				schemaConverter: () => ({ properties: { q: { type: "string" } } }),
				transformOperation,
			},
		);
		expect(operation.operationId).toBe("users.list");
		expect(transformOperation).toHaveBeenCalledWith({
			route: list["~restrpc"],
			routePath: ["users", "list"],
			operation: {
				parameters: [
					{
						name: "q",
						in: "query",
						required: false,
						schema: { type: "string" },
					},
				],
				responses: { 204: { description: "" } },
			},
		});
	});

	it("documents dynamic path segments without a params schema as strings", () => {
		expect(operationOf(route.get("/users/:id/posts/:slug")).parameters).toEqual(
			[
				{ name: "id", in: "path", required: true, schema: { type: "string" } },
				{
					name: "slug",
					in: "path",
					required: true,
					schema: { type: "string" },
				},
			],
		);
	});
});
