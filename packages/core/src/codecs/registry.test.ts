import { createBodyCodecRegistry } from "./registry.ts";
import { serializedBody } from "./serializedBody.ts";

describe("createBodyCodecRegistry", () => {
	it("prefers exact media types over patterns, then codec order", () => {
		const registry = createBodyCodecRegistry([
			{ mediaTypes: [/json/], serialize: () => "pattern" },
			{
				mediaTypes: ["application/vnd.api+json"],
				serialize: () => "exact",
			},
			{ mediaTypes: [/^text\//], serialize: () => "custom text" },
		]);
		expect(registry.serialize({}, "application/vnd.api+json")).toBe("exact");
		expect(registry.serialize({}, "application/x-json")).toBe("pattern");
		expect(registry.serialize("a", "text/plain")).toBe("custom text");
		expect(registry.serialize({}, "application/json")).toBe("{}");
	});

	it("selects serializers and deserializers independently", async () => {
		const registry = createBodyCodecRegistry([
			{ mediaTypes: ["application/json"], serialize: () => "x" },
		]);
		expect(registry.serialize({}, "application/json")).toBe("x");
		expect(
			await registry.deserialize(Response.json({ a: 1 }), "application/json"),
		).toEqual({ a: 1 });
	});

	it("allows content-type parameters but rejects changing the base media type", async () => {
		const registry = (contentType: string) =>
			createBodyCodecRegistry([
				{
					mediaTypes: ["text/plain"],
					serialize: async (value) =>
						serializedBody(String(value), { "content-type": contentType }),
				},
			]);
		await expect(
			registry("text/plain; charset=utf-8").serialize("text", "text/plain"),
		).resolves.toEqual(
			serializedBody("text", { "content-type": "text/plain; charset=utf-8" }),
		);
		await expect(
			registry("application/json").serialize("text", "text/plain"),
		).rejects.toThrow(
			"Codec content-type must retain the declared base media type",
		);
	});
});
