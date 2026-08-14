import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	type StandardSchemaV1,
	validateStandardSchema,
	validateStandardSchemaSync,
} from "./index.ts";

describe("validateStandardSchema", () => {
	it("returns synchronous validation results", async () => {
		const schema: StandardSchemaV1<unknown, string> = {
			"~standard": {
				version: 1,
				vendor: "test",
				validate: () => ({ value: "ok" }),
			},
		};

		assert.deepEqual(await validateStandardSchema(schema, "input"), {
			value: "ok",
		});
	});
});

describe("validateStandardSchemaSync", () => {
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
