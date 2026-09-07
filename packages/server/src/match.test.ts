import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import { createRouteMatcher } from "./match.ts";

const implementation = (method: "GET" | "POST", path: string) => ({
	route:
		method === "GET"
			? coreRoute.get(path).response(204)
			: coreRoute.post(path).response(204),
	handler: () => undefined,
});

describe("createRouteMatcher", () => {
	it("returns the most specific implementation and decoded path params", () => {
		const getTodo = implementation("GET", "/todos/:id");
		const createTodo = implementation("GET", "/todos/new");
		const matchRoute = createRouteMatcher([getTodo, createTodo]);

		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/new" }), {
			implementation: createTodo,
			params: {},
		});
		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/one%20two" }), {
			implementation: getTodo,
			params: { id: "one two" },
		});
	});

	it("respects methods and optional trailing slashes", () => {
		const getTodo = implementation("GET", "/todos/:id");
		const createTodo = implementation("POST", "/todos/:id");
		const matchRoute = createRouteMatcher([getTodo, createTodo]);

		assert.deepEqual(matchRoute({ method: "POST", path: "/todos/todo-1/" }), {
			implementation: createTodo,
			params: { id: "todo-1" },
		});
		assert.equal(
			matchRoute({ method: "DELETE", path: "/todos/todo-1" }),
			undefined,
		);
	});

	it("matches route specificity within the requested method", () => {
		const getTodo = implementation("GET", "/todos/:id");
		const createNewTodo = implementation("POST", "/todos/new");
		const matchRoute = createRouteMatcher([getTodo, createNewTodo]);

		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/new" }), {
			implementation: getTodo,
			params: { id: "new" },
		});
	});

	it("escapes literal route characters before matching paths", () => {
		const literal = implementation("GET", "/files/index.json");
		const matchRoute = createRouteMatcher([literal]);

		assert.deepEqual(matchRoute({ method: "GET", path: "/files/index.json" }), {
			implementation: literal,
			params: {},
		});
		assert.equal(
			matchRoute({ method: "GET", path: "/files/indexxjson" }),
			undefined,
		);
	});
});
