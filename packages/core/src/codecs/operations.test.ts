import { normalizeMediaType, resolveBodyCodec } from "./operations.ts";
import type { BodyCodec } from "./types.ts";

describe("operations", () => {
	it("normalizes header parameters and absent media types", () => {
		expect(normalizeMediaType(" Application/JSON ; charset=utf-8")).toBe(
			"application/json",
		);
		expect(normalizeMediaType(null)).toBe("");
	});

	it("selects the first matching serializer and deserializer independently", async () => {
		const deserialize = async () => "decoded";
		const codecs: BodyCodec<Response>[] = [
			{ match: () => false, serialize: () => ({ body: "ignored" }) },
			{ match: () => true, serialize: () => ({ body: "first" }) },
			{ match: () => true, serialize: () => ({ body: "second" }), deserialize },
		];
		const codec = resolveBodyCodec("text/plain", codecs);
		expect(await codec?.serialize?.("value", "text/plain")).toEqual({
			body: "first",
		});
		expect(codec?.deserialize).toBe(deserialize);
		expect(resolveBodyCodec("", codecs)).toBeUndefined();
		expect(resolveBodyCodec("text/plain", [])).toBeUndefined();
	});

	it("allows content-type parameters but rejects changing the base media type", async () => {
		const codec = (contentType: string) =>
			resolveBodyCodec("text/plain", [
				{ match: () => true, serialize: () => ({ body: "text", contentType }) },
			]);
		await expect(
			codec("text/plain; charset=utf-8")?.serialize?.("text", "text/plain"),
		).resolves.toMatchObject({ contentType: "text/plain; charset=utf-8" });
		await expect(
			codec("application/json")?.serialize?.("text", "text/plain"),
		).rejects.toThrow(
			"Codec content-type must retain the declared base media type",
		);
	});
});
