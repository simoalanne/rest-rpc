import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import { createRouteMatcher } from "./match.ts";

const route = (method: "GET" | "POST", path: string) =>
	method === "GET"
		? coreRoute.get(path).response(204)
		: coreRoute.post(path).response(204);

describe("createRouteMatcher", () => {
	it("matches the most specific route and decodes path params", () => {
		const matchRoute = createRouteMatcher({
			todos: {
				get: route("GET", "/todos/:id"),
				new: route("GET", "/todos/new"),
			},
		});

		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/new" }), {
			type: "match",
			route: route("GET", "/todos/new"),
			params: {},
		});
		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/one%20two" }), {
			type: "match",
			route: route("GET", "/todos/:id"),
			params: { id: "one two" },
		});
	});

	it("respects methods and optional trailing slashes", () => {
		const matchRoute = createRouteMatcher({
			getTodo: route("GET", "/todos/:id"),
			createTodo: route("POST", "/todos/:id"),
		});

		assert.deepEqual(matchRoute({ method: "POST", path: "/todos/todo-1/" }), {
			type: "match",
			route: route("POST", "/todos/:id"),
			params: { id: "todo-1" },
		});
		assert.deepEqual(matchRoute({ method: "DELETE", path: "/todos/todo-1" }), {
			type: "methodNotAllowed",
			allowedMethods: ["GET", "POST"],
		});
	});

	it("reports allowed methods for the most specific matching path", () => {
		const matchRoute = createRouteMatcher({
			getTodo: route("GET", "/todos/:id"),
			createNewTodo: route("POST", "/todos/new"),
		});

		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/new" }), {
			type: "methodNotAllowed",
			allowedMethods: ["POST"],
		});
	});

	it("escapes literal route characters before matching paths", () => {
		const matchRoute = createRouteMatcher({
			literal: route("GET", "/files/index.json"),
		});

		assert.deepEqual(matchRoute({ method: "GET", path: "/files/index.json" }), {
			type: "match",
			route: route("GET", "/files/index.json"),
			params: {},
		});
		assert.equal(
			matchRoute({ method: "GET", path: "/files/indexxjson" }),
			null,
		);
	});
});
