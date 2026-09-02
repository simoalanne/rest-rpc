import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import { RouteResponseError } from "./routeResponseError.ts";

const route = coreRoute.get("/todos/:id").response(404);

describe("RouteResponseError", () => {
	it("stores the route and response envelope fields", () => {
		const response = { status: 404, body: undefined };
		const error = new RouteResponseError(route, response);

		assert.equal(error.message, "Route response error");
		assert.equal(error.route, route);
		assert.equal(error.response, response);
		assert.equal(error.status, 404);
		assert.equal(error.body, undefined);
	});
});
