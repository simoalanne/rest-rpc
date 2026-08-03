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

	it("should populate empty metadata on route declarations", () => {
		const contract = defineContract({
			todos: {
				list: {
					method: "GET",
					path: "/todos",
					responses: {},
				},
			},
		});

		assert.deepEqual(contract.todos.list.metadata, {});
	});

	it("should merge shared metadata with route metadata", () => {
		const contract = defineContract(
			{
				todos: {
					list: {
						method: "GET",
						path: "/todos",
						metadata: {
							auth: "optional",
							audit: true,
						},
						responses: {},
					},
					create: {
						method: "POST",
						path: "/todos",
						responses: {},
					},
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
