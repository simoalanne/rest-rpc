import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOpenApiTestContract } from "../../test/factories/openapi.ts";
import { contractRoutes } from "../contract/traversal.ts";
import { isOpenApiRoute } from "./routes.ts";

describe("OpenAPI route helpers", () => {
	it("includes HTTP routes and skips websocket routes", () => {
		const routes = [...contractRoutes(createOpenApiTestContract())];
		const openApiPaths = routes
			.filter(isOpenApiRoute)
			.map((route) => route.path)
			.sort();

		assert.deepEqual(openApiPaths, [
			"/todos",
			"/todos/:id",
			"/todos/:id",
			"/todos/events",
			"/todos/import",
		]);
	});
});
