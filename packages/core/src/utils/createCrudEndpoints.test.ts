import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { createCrudEndpoints } from "./createCrudEndpoints.ts";

describe("createCrudEndpoints", () => {
	it("should use override schemas for list and getById when provided", () => {
		const baseSchema = z.object({ id: z.number(), name: z.string() });
		const createSchema = z.object({ name: z.string() });
		const listSchema = z.object({ id: z.number() });
		const getByIdSchema = z.object({ id: z.number(), details: z.string() });

		const endpoints = createCrudEndpoints({
			entity: "products",
			schema: baseSchema,
			createSchema,
			listSchema,
			getByIdSchema,
		});

		const listResult = endpoints.getAll.response.safeParse([{ id: 1 }]);
		assert.equal(listResult.success, true);

		const getByIdResult = endpoints.getById.response.safeParse({
			id: 1,
			details: "x",
		});
		assert.equal(getByIdResult.success, true);

		const invalidGetByIdResult = endpoints.getById.response.safeParse({
			id: 1,
		});
		assert.equal(invalidGetByIdResult.success, false);
	});

	it("should fallback list and getById schemas to base schema when overrides are omitted", () => {
		const baseSchema = z.object({ id: z.number(), name: z.string() });
		const createSchema = z.object({ name: z.string() });

		const endpoints = createCrudEndpoints({
			entity: "products",
			schema: baseSchema,
			createSchema,
		});

		const listResult = endpoints.getAll.response.safeParse([
			{ id: 1, name: "A" },
		]);
		assert.equal(listResult.success, true);

		const getByIdResult = endpoints.getById.response.safeParse({
			id: 1,
			name: "A",
		});
		assert.equal(getByIdResult.success, true);
	});

	it("should create standard CRUD paths", () => {
		const baseSchema = z.object({ id: z.number(), name: z.string() });
		const createSchema = z.object({ name: z.string() });

		const endpoints = createCrudEndpoints({
			entity: "products",
			schema: baseSchema,
			createSchema,
		});

		assert.equal(endpoints.getAll.path, "/products");
		assert.equal(endpoints.getById.path, "/products/:id");
		assert.equal(endpoints.create.path, "/products");
		assert.equal(endpoints.update.path, "/products/:id");
		assert.equal(endpoints.delete.path, "/products/:id");
	});
});
