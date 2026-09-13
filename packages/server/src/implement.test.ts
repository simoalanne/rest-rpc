import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "@rest-rpc/core";
import { createRouteMatcher } from "./match.ts";
import { implement } from "./implement.ts";

describe("implement", () => {
	it("preserves contract identity and derives procedure paths", () => {
		const contract = {
			todos: {
				get: route.output({
					"~standard": {
						version: 1,
						vendor: "test",
						validate: (value) => ({ value }),
					},
				}),
			},
		};
		const implementor = implement(contract);
		assert.equal(implementor, contract);

		const implementation = implementor.todos.get.handler(() => "todo-1");
		const match = createRouteMatcher({ todos: { get: implementation } })({
			method: "POST",
			path: "/todos/get",
		});
		assert.equal(match?.implementation.route.path, "/todos/get");
		assert.equal(match?.implementation.handler(), "todo-1");
	});
});
