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
		expect(
			registry.serialize({}, { "content-type": "application/vnd.api+json" }),
		).toBe("exact");
		expect(
			registry.serialize({}, { "content-type": "application/x-json" }),
		).toBe("pattern");
		expect(registry.serialize("a", { "content-type": "text/plain" })).toBe(
			"custom text",
		);
		expect(registry.serialize({}, { "content-type": "application/json" })).toBe(
			"{}",
		);
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

	it("allows content-type parameters but rejects changing the base media type", async () => {
		const registry = (contentType: string) =>
			createBodyCodecRegistry([
				{
					mediaTypes: ["text/plain"],
					serialize: async (value) =>
						serializedBody(String(value), {
							headers: { "content-type": contentType },
						}),
				},
			]);
		await expect(
			registry("text/plain; charset=utf-8").serialize("text", {
				"content-type": "text/plain",
			}),
		).resolves.toEqual(
			serializedBody("text", {
				headers: { "content-type": "text/plain; charset=utf-8" },
			}),
		);
		await expect(
			registry("application/json").serialize("text", {
				"content-type": "text/plain",
			}),
		).rejects.toThrow();
	});
});
