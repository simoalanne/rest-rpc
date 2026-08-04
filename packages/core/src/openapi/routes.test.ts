import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contractRoutes } from "../contract/traversal.ts";
import { createOpenApiTestContract } from "./factories.ts";
import { isOpenApiRoute, toOpenApiPath } from "./routes.ts";

describe("OpenAPI route helpers", () => {
	it("converts contract path params to OpenAPI path params", () => {
		assert.equal(
			toOpenApiPath("/orgs/:orgId/todos/:todo_id"),
			"/orgs/{orgId}/todos/{todo_id}",
		);
	});

	it("includes HTTP routes and skips streaming and websocket routes", () => {
		const routes = [...contractRoutes(createOpenApiTestContract())];
		const openApiPaths = routes
			.filter(isOpenApiRoute)
			.map((route) => route.path)
			.sort();

		assert.deepEqual(openApiPaths, [
			"/todos",
			"/todos/:id",
			"/todos/:id",
			"/todos/import",
		]);
	});
});
