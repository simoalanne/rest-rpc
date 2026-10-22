import { safe } from "./safe.ts";

describe("safe", () => {
	it("resolves to an error-first tuple", async () => {
		const failure = new Error("offline");
		expect(await safe(Promise.resolve("Ada"))).toEqual([null, "Ada"]);
		expect(await safe(Promise.reject(failure))).toEqual([failure, undefined]);
	});
});
