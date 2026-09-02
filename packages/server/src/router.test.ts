import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import { route, router } from "./router.ts";

const getTodo = coreRoute.get("/todos/:id").response(204);

const createTodo = coreRoute.post("/todos").response(204);

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

	it("supports class methods wrapped by a handler function", async () => {
		class TodoService {
			#prefix = "todo";

			get(_request: unknown) {
				return `${this.#prefix}-1`;
			}
		}

		const service = new TodoService();
		const implementation = router(
			{
				todos: {
					get: getTodo,
				},
			},
			{
				todos: {
					get: (request) => service.get(request),
				},
			},
		);

		assert.equal(await implementation.todos.get.handler({}), "todo-1");
	});

	it("supports explicitly bound class methods", async () => {
		class TodoService {
			#prefix = "todo";

			get(_request: unknown) {
				return `${this.#prefix}-1`;
			}
		}

		const service = new TodoService();
		const implementation = router(
			{
				todos: {
					get: getTodo,
				},
			},
			{
				todos: {
					get: service.get.bind(service),
				},
			},
		);

		assert.equal(await implementation.todos.get.handler({}), "todo-1");
	});

	it("binds class methods passed as router subtrees", async () => {
		class TodoService {
			#prefix = "todo";

			get(_request: unknown) {
				return `${this.#prefix}-1`;
			}
		}

		const implementation = router(
			{
				todos: {
					get: getTodo,
				},
			},
			{
				todos: new TodoService(),
			},
		);

		assert.equal(await implementation.todos.get.handler({}), "todo-1");
	});

	it("allows class instances with public service fields", async () => {
		class TodoService {
			readonly prefix = "todo";

			get(_request: unknown) {
				return `${this.prefix}-1`;
			}
		}

		const implementation = router(
			{
				todos: {
					get: getTodo,
				},
			},
			{
				todos: new TodoService(),
			},
		);

		assert.equal(await implementation.todos.get.handler({}), "todo-1");
	});

	it("does not bind class methods inside compiled route implementations", () => {
		class TodoService {
			#prefix = "todo";

			get(_request: unknown) {
				return `${this.#prefix}-1`;
			}
		}

		const service = new TodoService();
		const implementation = router(
			{
				todos: {
					get: getTodo,
				},
			},
			{
				todos: {
					get: route(getTodo, service.get),
				},
			},
		);

		assert.throws(() => implementation.todos.get.handler({}), TypeError);
	});

	it("rejects route services that resolve to non-functions", () => {
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
							get: "todo",
						},
					} as never,
				),
			/Resolved service for "todos.get" is not a function/,
		);
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
