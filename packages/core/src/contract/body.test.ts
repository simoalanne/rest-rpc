import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { resolveBodyWithArrayKeys } from "./body.ts";

describe("resolveBodyWithArrayKeys", () => {
	it("infers array keys from supported object schemas", () => {
		const schema = z.object({
			title: z.string(),
			tags: z.array(z.string()),
		});
		const result = resolveBodyWithArrayKeys(schema);

		assert.equal(result.schema, schema);
		assert.deepEqual(result.arrayKeys, ["tags"]);
	});

	it("preserves explicit array keys", () => {
		const schema = z.object({
			title: z.string(),
		});

		assert.deepEqual(
			resolveBodyWithArrayKeys({
				schema,
				arrayKeys: ["tags"],
			}),
			{
				schema,
				arrayKeys: ["tags"],
			},
		);
	});

	it("returns empty array when no array keys are present", () => {
		assert.deepEqual(
			resolveBodyWithArrayKeys(z.union([z.string(), z.number()])).arrayKeys,
			[],
		);
	});
});
