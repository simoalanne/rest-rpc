import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type } from "../standard-schema/type.ts";
import { route } from "./routeFactory.ts";
import { contractRoutes, mapContractRoutes } from "./traversal.ts";

const getTodo = route.get("/todos/:id").response(204);

const listUsers = route.get("/users").response(204);
const addTodo = route.output(type<{ id: string }>());

describe("contract traversal", () => {
	it("maps nested routes with their object path", () => {
		const mapped = mapContractRoutes(
			{
				todos: {
					get: getTodo,
				},
				users: {
					list: listUsers,
				},
			},
			(route, path) => ({
				method: route.method,
				path,
			}),
		);

		assert.deepEqual(mapped, {
			todos: {
				get: {
					method: "GET",
					path: ["todos", "get"],
				},
			},
			users: {
				list: {
					method: "GET",
					path: ["users", "list"],
				},
			},
		});
	});

	it("iterates routes in contract object order", () => {
		assert.deepEqual(
			[
				...contractRoutes({
					todos: {
						get: getTodo,
					},
					users: {
						list: listUsers,
					},
				}),
			],
			[getTodo, listUsers],
		);
	});

	it("treats shorthand declarations as routes with tree-derived paths", () => {
		const contract = { todos: { add: addTodo } };
		assert.equal(
			(
				mapContractRoutes(contract, (_route, path) => path) as {
					todos: { add: string[] };
				}
			).todos.add.join("/"),
			"todos/add",
		);
		const [resolvedRoute] = [...contractRoutes(contract)];
		assert.equal(resolvedRoute?.method, "POST");
		assert.equal(resolvedRoute?.path, "/todos/add");
	});
});
