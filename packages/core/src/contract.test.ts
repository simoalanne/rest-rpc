import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defineContract } from "./contract.ts";

describe("defineContract", () => {
	it("should normalize shared path prefixes onto route declarations", () => {
		const contract = defineContract(
			{
				todos: {
					list: {
						method: "GET",
						path: "/todos",
						responses: {},
					},
				},
				health: {
					method: "GET",
					path: "/",
					responses: {},
				},
			},
			{ pathPrefix: "/api/" },
		);

		assert.equal(contract.todos.list.path, "/api/todos");
		assert.equal(contract.health.path, "/api");
	});
});
