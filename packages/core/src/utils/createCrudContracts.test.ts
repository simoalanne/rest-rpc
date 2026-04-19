import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { createCrudContracts } from "./createCrudContracts.ts";

describe("createCrudContracts", () => {
	it("should use override schemas for list and getById when provided", () => {
		const baseSchema = z.object({ id: z.number(), name: z.string() });
		const createSchema = z.object({ name: z.string() });
		const listSchema = z.object({ id: z.number() });
		const getByIdSchema = z.object({ id: z.number(), details: z.string() });

		const contracts = createCrudContracts({
			entity: "products",
			schema: baseSchema,
			createSchema,
			listSchema,
			getByIdSchema,
		});

		const listResult = contracts.getAll.response.safeParse([{ id: 1 }]);
		assert.equal(listResult.success, true);

		const getByIdResult = contracts.getById.response.safeParse({
			id: 1,
			details: "x",
		});
		assert.equal(getByIdResult.success, true);

		const invalidGetByIdResult = contracts.getById.response.safeParse({
			id: 1,
		});
		assert.equal(invalidGetByIdResult.success, false);
	});

	it("should fallback list and getById schemas to base schema when overrides are omitted", () => {
		const baseSchema = z.object({ id: z.number(), name: z.string() });
		const createSchema = z.object({ name: z.string() });

		const contracts = createCrudContracts({
			entity: "products",
			schema: baseSchema,
			createSchema,
		});

		const listResult = contracts.getAll.response.safeParse([
			{ id: 1, name: "A" },
		]);
		assert.equal(listResult.success, true);

		const getByIdResult = contracts.getById.response.safeParse({
			id: 1,
			name: "A",
		});
		assert.equal(getByIdResult.success, true);
	});

	it("should create standard CRUD paths", () => {
		const baseSchema = z.object({ id: z.number(), name: z.string() });
		const createSchema = z.object({ name: z.string() });

		const contracts = createCrudContracts({
			entity: "products",
			schema: baseSchema,
			createSchema,
		});

		assert.equal(contracts.getAll.path, "/products");
		assert.equal(contracts.getById.path, "/products/:id");
		assert.equal(contracts.create.path, "/products");
		assert.equal(contracts.update.path, "/products/:id");
		assert.equal(contracts.delete.path, "/products/:id");
	});
});
