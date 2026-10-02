import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import {
	createOperation,
	createParameters,
	createRequestBody,
	createResponse,
} from "./operation.ts";

describe("operation", () => {
	it("merges OpenAPI-only response headers with declared headers taking precedence", () => {
		const declared = type<{ count: number }>();
		const description = type<string>();
		const body = type<string>();
		const converter = vi.fn((schema: unknown, _mode: "input" | "output") =>
			schema === declared
				? { properties: { count: { type: "integer" } } }
				: { type: "string" },
		);
		expect(
			createResponse(
				"fallback",
				{ body, headers: declared, contentType: ["text/plain", "text/html"] },
				converter,
				{
					description: "Created",
					headers: {
						count: { description: "overridden", schema: description },
						extra: { description: "Extra", schema: description },
						plain: description,
					},
				},
			),
		).toEqual({
			description: "Created",
			headers: {
				count: { schema: { type: "integer" } },
				extra: { description: "Extra", schema: { type: "string" } },
				plain: { schema: { type: "string" } },
			},
			content: {
				"text/plain": { schema: { type: "string" } },
				"text/html": { schema: { type: "string" } },
			},
		});
		expect(converter.mock.calls.every((call) => call[1] === "output")).toBe(
			true,
		);
	});

	it("keeps query and header requirements from known schemas when another schema is unknown", () => {
		const known = type<{ required: string; optional?: string }>();
		const unknown = type();
		for (const location of ["query", "header"] as const) {
			expect(
				createParameters([known, unknown], location, {
					schemaConverter: (schema) =>
						schema === known
							? {
									properties: {
										required: { type: "string" },
										optional: { type: "string" },
									},
									required: ["required"],
								}
							: undefined,
				}),
			).toEqual([
				{
					name: "required",
					in: location,
					required: true,
					schema: { type: "string" },
				},
				{
					name: "optional",
					in: location,
					required: false,
					schema: { type: "string" },
				},
			]);
		}
	});

	it("preserves route metadata and extensions while generating response descriptions", () => {
		const metadata = {
			summary: "List users",
			description: "Description",
			operationId: "users.list",
			tags: ["users"],
			deprecated: true,
			security: [{ token: [] }],
			externalDocs: { url: "https://example.test/docs", description: "Docs" },
			extensions: { "x-owner": "users" },
			responses: { 204: { description: "No users" } },
		};
		const declaration = route.get("/").response(204).openAPI(metadata)[
			"~restrpc"
		];
		expect(createOperation(declaration, {})).toEqual({
			summary: metadata.summary,
			description: metadata.description,
			operationId: metadata.operationId,
			tags: metadata.tags,
			deprecated: true,
			security: metadata.security,
			externalDocs: metadata.externalDocs,
			"x-owner": "users",
			responses: { 204: { description: "No users", headers: {} } },
		});
	});

	it("falls back to empty schemas and original operations when hooks return undefined", () => {
		const declaration = route
			.get("/")
			.query(type<{ q: string }>())
			.response(200, type<string>())["~restrpc"];
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
			createParameters(second, "path", options).map(
				(parameter) => parameter.required,
			),
		).toEqual([true, true]);
	});

	it("combines request schemas for every declared content type", () => {
		const body = createRequestBody(
			[type<string>(), type<string>()],
			() => ({ type: "string" }),
			["text/plain", "application/json"],
		);
		expect(body?.content).toEqual({
			"text/plain": {
				schema: { allOf: [{ type: "string" }, { type: "string" }] },
			},
			"application/json": {
				schema: { allOf: [{ type: "string" }, { type: "string" }] },
			},
		});
		expect(createRequestBody([], undefined)).toBeUndefined();
		expect(createRequestBody(type<string>(), undefined, [])).toBeUndefined();
	});

	it("omits content for bodyless responses and uses SSE for streams", () => {
		expect(createResponse("Deleted", { body: undefined }, undefined)).toEqual({
			description: "Deleted",
		});
		expect(
			createResponse(
				"Updates",
				{ kind: "stream", body: type<string>() },
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
			.response(204)["~restrpc"];
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
});
