import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import {
	convertSchema,
	getRequiredSchemaKeys,
	getSchemaProperties,
	isSchemaOptional,
} from "./schemas.ts";
import type { OpenApiSchema } from "./types.ts";

describe("OpenAPI schema helpers", () => {
	it("returns schema properties and required keys", () => {
		const schema: OpenApiSchema = {
			type: "object",
			properties: {
				id: { type: "string" },
				title: { type: "string" },
			},
			required: ["id"],
		};

		assert.deepEqual(getSchemaProperties(schema), {
			id: { type: "string" },
			title: { type: "string" },
		});
		assert.deepEqual([...getRequiredSchemaKeys(schema)], ["id"]);
	});

	it("falls back to empty properties and required keys", () => {
		const schema: OpenApiSchema = { type: "object" };

		assert.deepEqual(getSchemaProperties(schema), {});
		assert.deepEqual([...getRequiredSchemaKeys(schema)], []);
	});

	it("detects schemas that accept undefined", () => {
		assert.equal(isSchemaOptional(z.string().optional()), true);
		assert.equal(isSchemaOptional(z.string()), false);
	});

	it("passes schema and IO mode through to the converter", () => {
		const schema = z.object({ id: z.string() });

		assert.deepEqual(
			convertSchema(schema, "input", (candidate, options) => {
				assert.equal(candidate, schema);
				assert.deepEqual(options, { io: "input" });
				return { type: "object" };
			}),
			{ type: "object" },
		);
	});
});
