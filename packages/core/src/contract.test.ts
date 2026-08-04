import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { customBody, defineContract } from "./contract.ts";

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

	it("should reject body keys in query or params for custom request bodies", () => {
		assert.throws(
			() =>
				defineContract({
					uploads: {
						create: {
							method: "POST",
							path: "/uploads/:body",
							request: {
								params: z.object({ body: z.string() }),
								body: customBody({
									schema: z.instanceof(Uint8Array),
									contentType: "application/octet-stream",
								}),
							},
							responses: {
								204: z.undefined(),
							},
						},
					},
				}),
			/has a "body" key in query or params/,
		);
	});

	it("should allow body keys in query or params without custom request bodies", () => {
		const contract = defineContract({
			search: {
				find: {
					method: "GET",
					path: "/search/:body",
					request: {
						params: z.object({ body: z.string() }),
					},
					responses: {
						200: z.object({ ok: z.boolean() }),
					},
				},
			},
		});

		assert.equal(
			contract.search.find.request.params.parse({ body: "q" }).body,
			"q",
		);
	});
});
