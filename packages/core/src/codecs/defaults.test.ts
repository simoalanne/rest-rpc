import { createBodyCodecRegistry } from "./registry.ts";
import { serializedBody } from "./serializedBody.ts";

const codecs = createBodyCodecRegistry([]);

describe("defaults", () => {
	it("round-trips JSON including structured suffix media types", async () => {
		const value = { message: "missing" };
		expect(codecs.serialize(value, "application/problem+json")).toBe(
			JSON.stringify(value),
		);
		expect(
			await codecs.deserialize(
				Response.json(value),
				"application/problem+json",
			),
		).toEqual(value);
		expect(() =>
			codecs.serialize(undefined, "application/problem+json"),
		).toThrow("Expected a JSON body");
	});

	it("leaves the multipart content type to the runtime", () => {
		const body = new FormData();
		expect(codecs.serialize(body, "multipart/form-data")).toEqual(
			serializedBody(body),
		);
		expect(() =>
			codecs.serialize({ name: "Ada" }, "multipart/form-data"),
		).toThrow("Expected FormData body");
	});

	it("preserves URLSearchParams and decodes repeated form values", async () => {
		const mediaType = "application/x-www-form-urlencoded";
		const body = new URLSearchParams("tag=a&tag=b");
		expect(codecs.serialize(body, mediaType)).toBe(body);
		expect(await codecs.deserialize(new Response(body), mediaType)).toEqual(
			body,
		);
		expect(() => codecs.serialize("tag=a", mediaType)).toThrow(
			"Expected URLSearchParams body",
		);
	});

	it("accepts text strings and binary values but rejects other body shapes", () => {
		expect(codecs.serialize("Ada", "text/plain")).toBe("Ada");
		expect(() => codecs.serialize(1, "text/plain")).toThrow(
			"Expected string body",
		);
		for (const body of [
			new Uint8Array([1]),
			new Blob(["data"]),
			new ReadableStream(),
			(async function* () {})(),
		]) {
			expect(codecs.serialize(body, "application/octet-stream")).toBe(body);
		}
		expect(() => codecs.serialize("data", "application/octet-stream")).toThrow(
			"Expected Blob, Uint8Array, ReadableStream or AsyncIterable body",
		);
	});
});
