import { createBodyCodecRegistry } from "./registry.ts";

describe("createBodyCodecRegistry", () => {
	it("prefers custom codecs, exact media types before patterns, over the defaults", () => {
		const registry = createBodyCodecRegistry([
			{ mediaTypes: [/json/], serialize: () => "pattern" },
			{
				mediaTypes: ["application/vnd.api+json"],
				serialize: () => "exact",
			},
		]);
		expect(
			registry.serialize({}, { "content-type": "application/vnd.api+json" }),
		).toBe("exact");
		expect(registry.serialize({}, { "content-type": "application/json" })).toBe(
			"pattern",
		);
		expect(registry.serialize("a", { "content-type": "text/plain" })).toBe("a");
	});

	it("lets a catch-all codec handle every media type", async () => {
		const registry = createBodyCodecRegistry([
			{
				mediaTypes: [/.*/],
				serialize: () => "custom",
				deserialize: () => "custom",
			},
		]);
		for (const mediaType of [
			"application/json",
			"application/x-www-form-urlencoded",
			"multipart/form-data",
			"text/plain",
		]) {
			expect(registry.serialize({}, { "content-type": mediaType })).toBe(
				"custom",
			);
			expect(
				await registry.deserialize(new Response("x"), mediaType, {
					"content-type": mediaType,
				}),
			).toBe("custom");
		}
	});

	it("selects serializers and deserializers independently", async () => {
		const registry = createBodyCodecRegistry([
			{ mediaTypes: ["application/json"], serialize: () => "x" },
		]);
		expect(registry.serialize({}, { "content-type": "application/json" })).toBe(
			"x",
		);
		expect(
			await registry.deserialize(Response.json({ a: 1 }), "application/json", {
				"content-type": "application/json",
			}),
		).toEqual({ a: 1 });
	});
});
