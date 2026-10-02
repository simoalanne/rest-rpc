import { defaultBodyCodecs } from "./defaults.ts";
import { resolveBodyCodec } from "./operations.ts";

describe("defaults", () => {
	it("round-trips JSON including structured suffix media types", async () => {
		const codec = resolveBodyCodec(
			"application/problem+json",
			defaultBodyCodecs,
		);
		const value = { message: "missing" };
		const serialized = await codec?.serialize?.(
			value,
			"application/problem+json",
		);
		expect(serialized?.body).toBe(JSON.stringify(value));
		expect(await codec?.deserialize?.(Response.json(value))).toEqual(value);
		await expect(
			codec?.serialize?.(undefined, "application/problem+json"),
		).rejects.toThrow("Expected a JSON body");
	});

	it("preserves form data and clears content-type so fetch can add its boundary", async () => {
		const codec = resolveBodyCodec("multipart/form-data", defaultBodyCodecs);
		const body = new FormData();
		body.append("name", "Ada");
		expect(await codec?.serialize?.(body, "multipart/form-data")).toEqual({
			body,
			contentType: null,
		});
		await expect(
			codec?.serialize?.({ name: "Ada" }, "multipart/form-data"),
		).rejects.toThrow("Expected FormData body");
	});

	it("preserves URLSearchParams and decodes repeated form values", async () => {
		const codec = resolveBodyCodec(
			"application/x-www-form-urlencoded",
			defaultBodyCodecs,
		);
		const body = new URLSearchParams("tag=a&tag=b");
		expect(
			await codec?.serialize?.(body, "application/x-www-form-urlencoded"),
		).toEqual({ body });
		const decoded = await codec?.deserialize?.(new Response(body));
		expect(decoded).toEqual(body);
		await expect(
			codec?.serialize?.("tag=a", "application/x-www-form-urlencoded"),
		).rejects.toThrow("Expected URLSearchParams body");
	});

	it("accepts text strings and binary values but rejects other body shapes", async () => {
		const text = resolveBodyCodec("text/plain", defaultBodyCodecs);
		expect(await text?.serialize?.("Ada", "text/plain")).toEqual({
			body: "Ada",
		});
		await expect(text?.serialize?.(1, "text/plain")).rejects.toThrow(
			"Expected string body",
		);
		const binary = resolveBodyCodec(
			"application/octet-stream",
			defaultBodyCodecs,
		);
		for (const body of [new Uint8Array([1]), new Blob(["data"])]) {
			expect(
				await binary?.serialize?.(body, "application/octet-stream"),
			).toEqual({ body });
		}
		await expect(
			binary?.serialize?.("data", "application/octet-stream"),
		).rejects.toThrow("Expected Blob or Uint8Array body");
	});
});
