import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noBody } from "./route.ts";
import { contractRoutes, mapContractRoutes } from "./traversal.ts";

const getTodo = {
	method: "GET",
	path: "/todos/:id",
	responses: {
		204: noBody(),
	},
} as const;

const listUsers = {
	method: "GET",
	path: "/users",
	responses: {
		204: noBody(),
	},
} as const;

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
});
