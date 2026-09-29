import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "@rest-rpc/core";
import { createRouteMatcher } from "./match.ts";
import { implement } from "./implement.ts";
import { serverFirstRoute } from "./routeBuilder.ts";

describe("implement", () => {
	it("creates an implementor facade and derives procedure paths", () => {
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
		assert.notEqual(implementor, contract);
		assert.deepEqual(Object.keys(implementor), ["todos", "$context", "use"]);
		assert.equal(implementor.$context<{ requestId: string }>(), implementor);

		const implementation = implementor.todos.get.handler(() => "todo-1");
		const match = createRouteMatcher({ todos: { get: implementation } })({
			method: "POST",
			path: "/todos/get",
		});
		assert.equal(match?.implementation.route.path, "/todos/get");
		assert.equal(match?.implementation.handler(), "todo-1");
	});

	it("appends shared middleware to every route in declaration order", () => {
		const contract = {
			first: route.output({
				"~standard": {
					version: 1,
					vendor: "test",
					validate: (value) => ({ value }),
				},
			}),
			second: route.output({
				"~standard": {
					version: 1,
					vendor: "test",
					validate: (value) => ({ value }),
				},
			}),
		};
		const outer = () => undefined;
		const inner = () => undefined;
		const local = () => undefined;
		const implementor = implement(contract).use(outer).use(inner);

		const first = implementor.first.use(local).handler(() => "first");
		const second = implementor.second.handler(() => "second");

		assert.deepEqual(first["~restrpc"].middleware, [outer, inner, local]);
		assert.deepEqual(second["~restrpc"].middleware, [outer, inner]);
	});

	it("rejects server-first middleware and routes implemented twice", () => {
		const output = {
			"~standard": {
				version: 1 as const,
				vendor: "test",
				validate: (value: unknown) => ({ value }),
			},
		};
		const routeWithMiddleware = serverFirstRoute
			.use(() => undefined)
			.output(output);
		assert.throws(
			() => implement(routeWithMiddleware),
			/Cannot implement a route that already has middleware/,
		);

		const implementation = implement(route.output(output)).handler(
			() => "first",
		);
		assert.throws(
			() => implement(implementation),
			/Cannot implement a route that already has a handler/,
		);
	});
});
