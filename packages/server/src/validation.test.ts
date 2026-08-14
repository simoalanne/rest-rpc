import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { validateRequest } from "./validation.ts";

describe("validateRequest", () => {
	it("parses JSON date strings with request body transforms", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/todos",
				request: {
					body: z.object({
						createdAt: z.iso.datetime().transform((value) => new Date(value)),
					}),
					requestKeys: {
						createdAt: "body",
					},
				},
				responses: {},
			},
			{
				body: { createdAt: "2026-08-10T00:00:00.000Z" },
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.ok(result.data.createdAt instanceof Date);
		}
	});

	it("rejects Date request bodies received as JSON strings", async () => {
		const wireBody = JSON.parse(
			JSON.stringify({ createdAt: new Date("2026-08-10T00:00:00.000Z") }),
		);

		const result = await validateRequest(
			{
				method: "POST",
				path: "/todos",
				request: {
					body: z.object({
						createdAt: z.date(),
					}),
					requestKeys: {
						createdAt: "body",
					},
				},
				responses: {},
			},
			{
				body: wireBody,
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.response.body.validationErrors.length, 1);
		}
	});

	it("parses string params and query with coercion or transforms", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos/:id",
				request: {
					params: {
						id: z.coerce.number(),
					},
					query: {
						published: z
							.enum(["true", "false"])
							.transform((value) => value === "true"),
					},
					requestKeys: {
						id: "params",
						published: "query",
					},
				},
				responses: {},
			},
			{
				params: { id: "123" },
				query: { published: "false" },
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				id: 123,
				published: false,
			});
		}
	});

	it("rejects numeric and boolean params or query without coercion", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos/:id",
				request: {
					params: {
						id: z.number(),
					},
					query: {
						published: z.boolean(),
					},
					requestKeys: {
						id: "params",
						published: "query",
					},
				},
				responses: {},
			},
			{
				params: { id: "123" },
				query: { published: "true" },
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.response.body.validationErrors.length, 2);
		}
	});
});
