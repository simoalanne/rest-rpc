import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { multipartBody } from "./body.ts";

describe("multipartBody", () => {
	it("rejects array keys without matching fields", () => {
		assert.throws(
			() =>
				multipartBody({
					fields: {
						title: z.string(),
					},
					arrayKeys: ["tagz" as "title"],
				}),
			/array key "tagz" does not have a matching field schema/,
		);
	});
});
