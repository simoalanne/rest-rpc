import { BodySerializationError, formDataCodec } from "../index.ts";
import { createBodyCodecRegistry } from "./registry.ts";

const codecs = createBodyCodecRegistry([]);

describe("defaults", () => {
	it("round-trips JSON including structured suffix media types", async () => {
		const value = { message: "missing" };
		expect(
			codecs.serialize(value, { "content-type": "application/problem+json" }),
		).toBe(JSON.stringify(value));
		expect(
			await codecs.deserialize(
				Response.json(value),
				"application/problem+json",
				{ "content-type": "application/problem+json" },
			),
		).toEqual(value);
		expect(() =>
			codecs.serialize(undefined, {
				"content-type": "application/problem+json",
			}),
		).toThrow();
	});

	it("serializes FormData as is", () => {
		const body = new FormData();
		expect(
			codecs.serialize(body, { "content-type": "multipart/form-data" }),
		).toBe(body);
		expect(() =>
			codecs.serialize(
				{ name: "Ada" },
				{ "content-type": "multipart/form-data" },
			),
		).toThrow();
	});

	it("preserves URLSearchParams and decodes repeated form values", async () => {
		const mediaType = "application/x-www-form-urlencoded";
		const body = new URLSearchParams("tag=a&tag=b");
		expect(codecs.serialize(body, { "content-type": mediaType })).toBe(body);
		expect(
			await codecs.deserialize(new Response(body), mediaType, {
				"content-type": mediaType,
			}),
		).toEqual(body);
		expect(() =>
			codecs.serialize("tag=a", { "content-type": mediaType }),
		).toThrow();
	});

	it("decodes multipart Fetch bodies", async () => {
		const form = new FormData();
		form.set("name", "Ada");
		const response = new Response(form);
		const decoded = await codecs.deserialize(response, "multipart/form-data", {
			"content-type": response.headers.get("content-type")!,
		});
		expect((decoded as FormData).get("name")).toBe("Ada");
	});

	it("accepts text strings and binary values but rejects other body shapes", () => {
		expect(codecs.serialize("Ada", { "content-type": "text/plain" })).toBe(
			"Ada",
		);
		expect(() =>
			codecs.serialize(1, { "content-type": "text/plain" }),
		).toThrow();
		for (const body of [
			new Uint8Array([1]),
			new Blob(["data"]),
			new ReadableStream(),
			(async function* () {})(),
		]) {
			expect(
				codecs.serialize(body, { "content-type": "application/octet-stream" }),
			).toBe(body);
		}
		expect(() =>
			codecs.serialize("data", { "content-type": "application/octet-stream" }),
		).toThrow();
	});

	it("throws BodySerializationError with the media type and value kinds", () => {
		const error = (() => {
			try {
				codecs.serialize(
					{ title: "Hello" },
					{ "content-type": "image/png; charset=binary" },
				);
			} catch (error) {
				return error;
			}
		})();
		expect(error).toBeInstanceOf(BodySerializationError);
		expect(error).toBeInstanceOf(TypeError);
		expect(error).toMatchObject({
			mediaType: "image/png",
			expected: ["Blob", "Uint8Array", "ReadableStream", "AsyncIterable"],
			received: "Object",
		});
		expect(() => formDataCodec.serialize(null)).toThrow(
			expect.objectContaining({
				mediaType: undefined,
				expected: ["FormData"],
				received: "null",
			}),
		);
	});
});
