import { createBodyCodecRegistry } from "./registry.ts";
import { serializedBody } from "./serializedBody.ts";
import type { IncomingBody } from "./types.ts";

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
				"application/problem+json",
			),
		).toEqual(value);
		expect(() =>
			codecs.serialize(undefined, "application/problem+json"),
		).toThrow();
	});

	it("leaves the multipart content type to the runtime", () => {
		const body = new FormData();
		expect(codecs.serialize(body, "multipart/form-data")).toEqual(
			serializedBody(body),
		);
		expect(() =>
			codecs.serialize({ name: "Ada" }, "multipart/form-data"),
		).toThrow();
	});

	it("preserves URLSearchParams and decodes repeated form values", async () => {
		const mediaType = "application/x-www-form-urlencoded";
		const body = new URLSearchParams("tag=a&tag=b");
		expect(codecs.serialize(body, mediaType)).toBe(body);
		expect(
			await codecs.deserialize(new Response(body), mediaType, mediaType),
		).toEqual(body);
		expect(() => codecs.serialize("tag=a", mediaType)).toThrow();
	});

	it("decodes incoming bodies that are not Fetch requests or responses", async () => {
		// Only the incoming body methods, as the Node server passes.
		const incoming = (response: Response): IncomingBody => ({
			text: () => response.text(),
			arrayBuffer: () => response.arrayBuffer(),
			blob: () => response.blob(),
			body: null,
		});
		expect(
			await codecs.deserialize(
				incoming(Response.json({ a: 1 })),
				"application/json",
				"application/json; charset=utf-8",
			),
		).toEqual({ a: 1 });

		const form = new FormData();
		form.set("name", "Ada");
		const multipart = new Response(form);
		const contentType = multipart.headers.get("content-type")!;
		const decoded = await codecs.deserialize(
			incoming(multipart),
			"multipart/form-data",
			contentType,
		);
		expect((decoded as FormData).get("name")).toBe("Ada");
	});

	it("accepts text strings and binary values but rejects other body shapes", () => {
		expect(codecs.serialize("Ada", "text/plain")).toBe("Ada");
		expect(() => codecs.serialize(1, "text/plain")).toThrow();
		for (const body of [
			new Uint8Array([1]),
			new Blob(["data"]),
			new ReadableStream(),
			(async function* () {})(),
		]) {
			expect(codecs.serialize(body, "application/octet-stream")).toBe(body);
		}
		expect(() =>
			codecs.serialize("data", "application/octet-stream"),
		).toThrow();
	});
});
