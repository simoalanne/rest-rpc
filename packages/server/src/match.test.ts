import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRouteMatcher } from "./match.ts";
import { serverFirstRoute } from "./routeBuilder.ts";

const implementation = (method: "GET" | "POST", path: string) =>
	(method === "GET" ? serverFirstRoute.get(path) : serverFirstRoute.post(path))
		.response(204)
		.handler(() => ({ status: 204 }));

describe("createRouteMatcher", () => {
	it("returns the most specific implementation and decoded path params", () => {
		const matchRoute = createRouteMatcher([
			implementation("GET", "/todos/:id"),
			implementation("GET", "/todos/new"),
		]);

		const staticMatch = matchRoute({ method: "GET", path: "/todos/new" });
		assert.equal(staticMatch?.implementation.route.path, "/todos/new");
		assert.deepEqual(staticMatch?.params, {});

		const paramMatch = matchRoute({
			method: "GET",
			path: "/todos/one%20two",
		});
		assert.equal(paramMatch?.implementation.route.path, "/todos/:id");
		assert.deepEqual(paramMatch?.params, { id: "one two" });
	});

	it("respects methods and optional trailing slashes", () => {
		const matchRoute = createRouteMatcher([
			implementation("GET", "/todos/:id"),
			implementation("POST", "/todos/:id"),
		]);

		assert.equal(
			matchRoute({ method: "POST", path: "/todos/todo-1/" })?.implementation
				.route.method,
			"POST",
		);
		assert.equal(
			matchRoute({ method: "DELETE", path: "/todos/todo-1" }),
			undefined,
		);
	});

	it("escapes literal route characters before matching paths", () => {
		const matchRoute = createRouteMatcher([
			implementation("GET", "/files/index.json"),
		]);

		assert.ok(matchRoute({ method: "GET", path: "/files/index.json" }));
		assert.equal(
			matchRoute({ method: "GET", path: "/files/indexxjson" }),
			undefined,
		);
	});
});
