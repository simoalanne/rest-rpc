import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { createOpenApiDocument } from "./document.ts";

describe("document", () => {
	it("copies document fields and defaults the required ones", () => {
		const options = {
			openapi: "3.0.3",
			info: {
				title: "Users",
				version: "1",
				description: "API",
				license: { name: "MIT" },
			},
			servers: [
				{
					url: "https://{region}.example.test",
					description: "Primary",
					variables: { region: { default: "eu" } },
				},
			],
			tags: [{ name: "users", description: "Users" }],
			components: {
				securitySchemes: { token: { type: "http", scheme: "bearer" } },
			},
			security: [{ token: [] }],
			externalDocs: { url: "https://example.test/docs" },
			"x-logo": { url: "https://example.test/logo.png" },
		};
		expect(createOpenApiDocument({}, options)).toEqual({
			...options,
			paths: {},
		});
		expect(createOpenApiDocument({})).toEqual({
			openapi: "3.2.1",
			info: { title: "API", version: "0.0.0" },
			paths: {},
		});
	});
	it("leaves `$schema` out of converted schemas", () => {
		const schema = type<{ title: string }>();
		const document = createOpenApiDocument(
			{
				create: route
					.post("/posts")
					.query(schema)
					.body(schema)
					.response(schema),
			},
			{
				schemaConverter: () => ({
					$schema: "https://json-schema.org/draft/2020-12/schema",
					type: "object",
					properties: { title: { type: "string" } },
				}),
			},
		);
		expect(JSON.stringify(document)).not.toContain("$schema");
	});
	it("documents routes without defined responses with a default placeholder", () => {
		const inferred = {
			"~restrpc": {
				...route.get("/").response({ status: 204 })["~restrpc"],
				responses: {},
			},
		};
		const document = createOpenApiDocument(
			{ inferred },
			{ info: { title: "Users", version: "1" } },
		);
		expect(document.paths["/"]?.get?.responses).toEqual({
			default: {
				description: expect.any(String),
			},
		});
	});
	it("normalizes explicit paths and derives paths from nested contract keys", () => {
		const contract = {
			users: {
				get: route.get("/users/:id").response(type<string>()),
				remove: route.delete("/users/:id").response({ status: 204 }),
				create: route.body(type<string>()).response(type<string>()),
			},
		};
		const document = createOpenApiDocument(contract, {
			info: { title: "Users", version: "1" },
		});
		expect(Object.keys(document.paths).sort()).toEqual([
			"/users/create",
			"/users/{id}",
		]);
		expect(Object.keys(document.paths["/users/{id}"]!).sort()).toEqual([
			"delete",
			"get",
		]);
		expect(document.paths["/users/create"]?.post?.requestBody?.content).toEqual(
			{
				"application/json": { schema: {} },
				"multipart/form-data": { schema: {} },
			},
		);
	});
});
