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
			matched: true,
			route: route("GET", "/todos/new"),
			params: {},
		});
		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/one%20two" }), {
			matched: true,
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
			matched: true,
			route: route("POST", "/todos/:id"),
			params: { id: "todo-1" },
		});
		assert.deepEqual(matchRoute({ method: "DELETE", path: "/todos/todo-1" }), {
			matched: false,
			route: undefined,
			params: undefined,
		});
	});

	it("matches route specificity within the requested method", () => {
		const matchRoute = createRouteMatcher({
			getTodo: route("GET", "/todos/:id"),
			createNewTodo: route("POST", "/todos/new"),
		});

		assert.deepEqual(matchRoute({ method: "GET", path: "/todos/new" }), {
			matched: true,
			route: route("GET", "/todos/:id"),
			params: { id: "new" },
		});
	});

	it("escapes literal route characters before matching paths", () => {
		const matchRoute = createRouteMatcher({
			literal: route("GET", "/files/index.json"),
		});

		assert.deepEqual(matchRoute({ method: "GET", path: "/files/index.json" }), {
			matched: true,
			route: route("GET", "/files/index.json"),
			params: {},
		});
		assert.deepEqual(matchRoute({ method: "GET", path: "/files/indexxjson" }), {
			matched: false,
			route: undefined,
			params: undefined,
		});
	});
});
