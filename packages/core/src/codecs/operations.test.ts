import { normalizeMediaType } from "./operations.ts";

describe("operations", () => {
	it("normalizes header parameters and absent media types", () => {
		expect(normalizeMediaType(" Application/JSON ; charset=utf-8")).toBe(
			"application/json",
		);
		expect(normalizeMediaType(null)).toBe("");
	});
});
