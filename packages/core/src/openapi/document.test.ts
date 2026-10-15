import { route } from "../contract/routeBuilder.ts";
import { type } from "../standard-schema/type.ts";
import { createOpenApiDocument } from "./document.ts";

describe("document", () => {
	it("preserves document metadata", () => {
		const options = {
			openapi: "3.0.3",
			info: { title: "Users", version: "1", description: "API" },
			servers: [{ url: "https://example.test", description: "Primary" }],
			tags: [{ name: "users", description: "Users" }],
			components: {
				securitySchemes: { token: { type: "http", scheme: "bearer" } },
			},
		};
		expect(createOpenApiDocument({}, options)).toEqual({
			...options,
			paths: {},
		});
	});
	it("documents routes without declared responses with a default placeholder", () => {
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
				description:
					"Response inferred from the route handler; not documented.",
			},
		});
	});
	it("normalizes explicit paths and derives paths from nested contract keys", () => {
		const contract = {
			users: {
				get: route.get("/users/:id").response(type<string>()),
				remove: route.delete("/users/{id}").response({ status: 204 }),
				create: route.body(type<string>()).response(type<string>()),
			},
		};
		const document = createOpenApiDocument(contract, {
			info: { title: "Users", version: "1" },
		});
		expect(Object.keys(document.paths)).toEqual([
			"/users/{id}",
			"/users/create",
		]);
		expect(Object.keys(document.paths["/users/{id}"]!)).toEqual([
			"get",
			"delete",
		]);
		expect(document.paths["/users/create"]?.post?.requestBody?.content).toEqual(
			{ "application/json": { schema: {} } },
		);
	});
});
