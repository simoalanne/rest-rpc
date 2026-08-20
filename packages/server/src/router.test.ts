import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noBody } from "@rest-rpc/core/contract";
import { route, router } from "./router.ts";

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

	it("leaves compiled route implementations unchanged", async () => {
		const getImplementation = route(getTodo, () => "todo-1");

		const implementation = router(
			{
				todos: {
					get: getTodo,
				},
			},
			{
				todos: {
					get: getImplementation,
				},
			},
		);

		assert.equal(implementation.todos.get, getImplementation);
		assert.equal(await implementation.todos.get.handler({}), "todo-1");
	});

	it("composes nested compiled router implementations", async () => {
		const todoRoutes = router(
			{
				get: getTodo,
				create: createTodo,
			},
			{
				get: route(getTodo, () => "todo-1"),
				create: () => "created",
			},
		);

		const implementation = router(
			{
				todos: {
					get: getTodo,
					create: createTodo,
				},
			},
			{
				todos: todoRoutes,
			},
		);

		assert.equal(implementation.todos.get, todoRoutes.get);
		assert.equal(implementation.todos.create, todoRoutes.create);
		assert.equal(await implementation.todos.get.handler({}), "todo-1");
		assert.equal(await implementation.todos.create.handler({}), "created");
	});

	it("rejects compiled route implementations that do not match the contract route", () => {
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
							get: route(createTodo, () => undefined),
						},
					} as never,
				),
			/does not match the contract route/,
		);
	});
});
