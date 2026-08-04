import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testContract, testRoute } from "./factories.ts";
import { normalizeContract } from "./normalize.ts";

describe("normalizeContract", () => {
	it("normalizes shared path prefixes onto route declarations", () => {
		const contract = normalizeContract(
			{
				todos: {
					list: testRoute({ path: "/todos" }),
				},
				health: testRoute({ path: "/" }),
			},
			{ pathPrefix: "/api/" },
		);

		assert.equal(contract.todos.list.path, "/api/todos");
		assert.equal(contract.health.path, "/api");
	});

	it("applies shared path prefixes each time normalization runs", () => {
		const contract = normalizeContract(testContract({ path: "/todos" }), {
			pathPrefix: "/api",
		});

		normalizeContract(contract, { pathPrefix: "/api" });

		assert.equal(contract.search.find.path, "/api/api/todos");
	});

	it("populates empty metadata on route declarations", () => {
		const contract = normalizeContract(testContract());

		assert.deepEqual(contract.search.find.metadata, {});
	});

	it("merges shared metadata with route metadata", () => {
		const contract = normalizeContract(
			{
				todos: {
					list: testRoute({
						metadata: {
							auth: "optional",
							audit: true,
						},
					}),
					create: testRoute(),
				},
			},
			{
				metadata: {
					auth: "required",
					source: "api",
				},
			},
		);

		assert.deepEqual(contract.todos.list.metadata, {
			auth: "optional",
			audit: true,
			source: "api",
		});
		assert.deepEqual(contract.todos.create.metadata, {
			auth: "required",
			source: "api",
		});
	});
});
