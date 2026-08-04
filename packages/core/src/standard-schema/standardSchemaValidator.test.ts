import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type StandardSchemaV1, validateStandardSchemaSync } from "./index.ts";

describe("validateStandardSchemaSync", () => {
	it("returns synchronous validation results", () => {
		const schema: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ value: "ok" }),
			},
		};

		assert.deepEqual(validateStandardSchemaSync(schema, "input"), {
			value: "ok",
		});
	});

	it("rejects async validation results", () => {
		const schema: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: async () => ({ value: "ok" }),
			},
		};

		assert.throws(
			() => validateStandardSchemaSync(schema, "input"),
			/Async schema validation is not supported/,
		);
	});
});
