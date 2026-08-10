import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noBody } from "@rest-rpc/core/contract";
import { route, router, routes } from "./router.ts";

const getTodo = {
	method: "GET",
	path: "/todos/:id",
	responses: {
		204: noBody(),
	},
} as const;

const createTodo = {
	method: "POST",
	path: "/todos",
	responses: {
		204: noBody(),
	},
} as const;

describe("router", () => {
	it("collects nested handler implementations and binds object methods", async () => {
		const services = {
			todos: {
				async get() {
					return `${this.prefix}-1`;
				},
			},
		};
		Object.defineProperty(services.todos, "prefix", {
			value: "todo",
		});

		const implementation = router(
			{
				todos: {
					get: getTodo,
				},
			},
			services,
		);

		assert.equal(await implementation.todos.get.handler({}), "todo-1");
	});

	it("rejects missing route services", () => {
		assert.throws(
			() =>
				router(
					{
						todos: {
							get: getTodo,
						},
					},
					{
						todos: {},
					} as never,
				),
			/Missing service for route "todos.get"/,
		);
	});

	it("rejects unexpected route services", () => {
		assert.throws(
			() =>
				router(
					{
						todos: {
							get: getTodo,
						},
					},
					{
						todos: {
							get: () => undefined,
							delete: () => undefined,
						},
					} as never,
				),
			/Unexpected service for route "todos.delete"/,
		);
	});
});

describe("routes", () => {
	it("validates an implementation tree against a contract", () => {
		const implementation = routes(
			{
				todos: {
					get: getTodo,
					create: createTodo,
				},
			},
			{
				todos: {
					get: route(getTodo, () => undefined),
					create: route(createTodo, () => undefined),
				},
			},
		);

		assert.equal(implementation.todos.get.route.path, "/todos/:id");
	});

	it("rejects mismatched route implementations", () => {
		assert.throws(
			() =>
				routes(
					{
						todos: {
							get: getTodo,
						},
					},
					{
						todos: {
							get: route(createTodo, () => undefined),
						},
					} as never,
				),
			/does not match the contract route/,
		);
	});

	it("rejects non-implementation trees before validating shape", () => {
		assert.throws(
			() =>
				routes(
					{
						todos: {
							get: getTodo,
						},
					},
					{
						todos: {
							get: () => undefined,
						},
					} as never,
				),
			/router\(\) requires an implementation tree to validate/,
		);
	});
});
