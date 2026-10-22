import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import {
	createOperation,
	createParameters,
	createRequestBody,
	createResponse,
} from "./operation.ts";

describe("operation", () => {
	it("documents declared response descriptions, headers and content types", () => {
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
		expect(
			createResponse(
				{
					content: { "text/plain": text, "application/json": json },
					headers,
					description: "Created",
				},
				converter,
			),
		).toEqual({
			description: "Created",
			headers: { count: { schema: { type: "integer" } } },
			content: {
				"text/plain": { schema: { type: "string" } },
				"application/json": { schema: { type: "object" } },
			},
		});
	});

	it("documents declared errors grouped by status next to inferred responses", () => {
		const data = type<{ id: string }>();
		const headers = type<{ "retry-after": number }>();
		const declaration = route
			.get("/")
			.error("NOT_FOUND", { status: 404, data, description: "Missing" })
			.error("GONE", { status: 404, headers, description: "Deleted" })
			.error("CONFLICT", { status: 409 })["~restrpc"];
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
			createOperation(declaration, { schemaConverter: converter }).responses,
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

	it("falls back to empty schemas and original operations when hooks return undefined", () => {
		const declaration = route
			.get("/")
			.query(type<{ q: string }>())
			.response(type<string>())["~restrpc"];
		type Options = Parameters<typeof createOperation>[1];
		const transformOperation = vi.fn(
			() => undefined,
		) as unknown as Options["transformOperation"];
		const transformParameter = vi.fn(
			() => undefined,
		) as unknown as Options["transformParameter"];
		expect(
			createOperation(declaration, {
				schemaConverter: () => undefined,
				transformOperation,
			}),
		).toMatchObject({
			responses: { 200: { content: { "application/json": { schema: {} } } } },
		});
		expect(
			createOperation(declaration, {
				schemaConverter: () => ({ properties: { q: { type: "string" } } }),
				transformParameter,
			}).parameters,
		).toEqual([
			{ name: "q", in: "query", required: false, schema: { type: "string" } },
		]);
	});
	it("combines repeated parameter constraints and unions required query keys", () => {
		const first = type<{ id: string }>();
		const second = type<{ id: string; optional?: string }>();
		const options = {
			schemaConverter: (schema: unknown) =>
				schema === first
					? { properties: { id: { type: "string" } }, required: ["id"] }
					: {
							properties: {
								id: { minLength: 1 },
								optional: { type: "string" },
							},
						},
		};
		expect(createParameters([first, second], "query", options)).toEqual([
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
			createParameters([second], "path", options).map(
				(parameter) => parameter.required,
			),
		).toEqual([true, true]);
	});

	it("combines stacked request schemas per media type", () => {
		const json = type<{ name: string }>();
		const body = createRequestBody(
			{ "text/plain": [type<string>()], "application/json": [json, json] },
			(schema) => (schema === json ? { type: "object" } : { type: "string" }),
		);
		expect(body?.content).toEqual({
			"text/plain": { schema: { type: "string" } },
			"application/json": {
				schema: { allOf: [{ type: "object" }, { type: "object" }] },
			},
		});
		expect(createRequestBody(undefined, undefined)).toBeUndefined();
	});

	it("omits content for bodyless responses and uses SSE for streams", () => {
		expect(createResponse({}, undefined)).toEqual({
			description: "",
		});
		expect(
			createResponse(
				{
					content: { "text/event-stream": type<string>() },
					description: "Updates",
				},
				() => ({ type: "string" }),
			),
		).toEqual({
			description: "Updates",
			content: { "text/event-stream": { schema: { type: "string" } } },
		});
	});

	it("passes transformed parameters into the operation hook with the contract path", () => {
		const declaration = route
			.get("/users")
			.query(type<{ q: string }>())
			.response({ status: 204 })["~restrpc"];
		const transformOperation = vi.fn(({ operation }) => ({
			...operation,
			operationId: "users.list",
		}));
		const operation = createOperation(
			declaration,
			{
				schemaConverter: () => ({ properties: { q: { type: "string" } } }),
				transformParameter: ({ parameter }) => ({
					...parameter,
					description: "Search",
				}),
				transformOperation,
			},
			["users", "list"],
		);
		expect(operation.parameters?.[0]?.description).toBe("Search");
		expect(operation.operationId).toBe("users.list");
		expect(transformOperation).toHaveBeenCalledWith(
			expect.objectContaining({
				route: declaration,
				routePath: ["users", "list"],
			}),
		);
	});

	it("documents dynamic path segments without a params schema as strings", () => {
		const declaration = route.get("/users/:id/posts/{slug}")["~restrpc"];
		expect(createOperation(declaration, {}).parameters).toEqual([
			{ name: "id", in: "path", required: true, schema: { type: "string" } },
			{ name: "slug", in: "path", required: true, schema: { type: "string" } },
		]);
	});
});
