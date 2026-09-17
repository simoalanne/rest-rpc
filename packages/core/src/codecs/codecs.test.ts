import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	defaultBodyCodecs,
	normalizeMediaType,
	resolveBodyCodec,
	type BodyCodec,
} from "./index.ts";

describe("body codec resolution", () => {
	it("normalizes media types and preserves original callback inputs", async () => {
		const contentType = "Text/Plain; charset=utf-8";
		assert.equal(
			normalizeMediaType(" Text/Plain ; charset=utf-8"),
			"text/plain",
		);
		const codec: BodyCodec<Response> = {
			match: (mediaType) => {
				assert.equal(mediaType, "text/plain");
				return true;
			},
			serialize: (value, declared) => {
				assert.equal(declared, contentType);
				return { body: value };
			},
			deserialize: (source) => {
				assert.equal(source.headers.get("content-type"), contentType);
				return source.text();
			},
		};
		const resolvedCodec = resolveBodyCodec(normalizeMediaType(contentType), [
			codec,
		]);
		assert.deepEqual(await resolvedCodec.serialize("hello", contentType), {
			body: "hello",
		});
		assert.equal(
			await resolvedCodec.deserialize(
				new Response("hello", { headers: { "content-type": contentType } }),
			),
			"hello",
		);
	});

	it("selects operations independently in user order before fallback order", async () => {
		const codecs: BodyCodec<Response>[] = [
			{
				match: () => {
					throw new Error("Inert rule must not match");
				},
			},
			{ match: () => true, serialize: () => ({ body: "custom" }) },
			{ match: () => true, deserialize: () => "first" },
			{
				match: () => {
					throw new Error("Resolved operations must stop matching");
				},
				deserialize: () => "late",
			},
		];
		const resolvedCodec = resolveBodyCodec("application/json", [
			...codecs,
			...defaultBodyCodecs,
		]);
		assert.deepEqual(await resolvedCodec!.serialize!("ignored", "text/plain"), {
			body: "custom",
		});
		assert.equal(resolvedCodec?.deserialize, codecs[2].deserialize);
		const partial = resolveBodyCodec("application/json", [
			...codecs.slice(0, 2),
			...defaultBodyCodecs,
		]);
		assert.deepEqual(await partial.deserialize(Response.json({ ok: true })), {
			ok: true,
		});
		const deserializeOnly = resolveBodyCodec("text/plain", [
			codecs[2],
			...defaultBodyCodecs,
		]);
		assert.deepEqual(
			await deserializeOnly!.serialize!("fallback", "text/plain"),
			{ body: "fallback" },
		);
	});

	it("returns undefined without matching for an empty type or unmatched rules", () => {
		assert.equal(
			resolveBodyCodec("", [
				{
					match: () => {
						throw new Error("Must not match");
					},
					deserialize: () => "wrong",
				},
			]),
			undefined,
		);
		assert.equal(
			resolveBodyCodec("text/plain", [
				{ match: () => false, serialize: () => ({ body: "" }) },
			]),
			undefined,
		);
		assert.equal(
			typeof resolveBodyCodec("text/plain", defaultBodyCodecs)?.serialize,
			"function",
		);
	});

	it("matches once per candidate without reading or invoking callbacks", () => {
		let matches = 0;
		const codec = {
			match: () => {
				matches++;
				return true;
			},
			serialize: () => {
				throw new Error("Must not serialize");
			},
			deserialize: () => {
				throw new Error("Must not deserialize");
			},
		};
		const resolvedCodec = resolveBodyCodec("text/plain", [codec]);
		assert.equal(matches, 1);
		assert.equal(typeof resolvedCodec?.serialize, "function");
		assert.equal(resolvedCodec?.deserialize, codec.deserialize);
	});

	it("resolves native user callbacks with fallbacks explicitly disabled", async () => {
		const source = { native: true };
		const resolvedCodec = resolveBodyCodec("application/json", [
			{ match: () => true, deserialize: (request: typeof source) => request },
		]);
		assert.equal(resolvedCodec?.serialize, undefined);
		assert.equal(await resolvedCodec!.deserialize!(source), source);
	});
});

describe("built-in body codecs", () => {
	it("round trips JSON, text, forms, multipart files, and binary without conversions", async () => {
		const form = new FormData();
		form.append("title", "Hello");
		form.append(
			"file",
			new File(["contents"], "hello.txt", { type: "text/plain" }),
		);
		for (const [contentType, value] of [
			["application/json", { title: "Hello", nested: [1] }],
			["application/problem+json", { detail: "Hello" }],
			["text/csv", "title\nHello"],
			[
				"application/x-www-form-urlencoded",
				new URLSearchParams([
					["title", "Hello"],
					["title", "Again"],
				]),
			],
			["multipart/form-data", form],
			[
				"image/png",
				new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
			],
		] as const) {
			const resolvedCodec = resolveBodyCodec(
				normalizeMediaType(contentType),
				defaultBodyCodecs,
			);
			const output = await resolvedCodec.serialize(value, contentType);
			const response = new Response(output.body as BodyInit, {
				headers:
					output.contentType === null
						? undefined
						: { "content-type": output.contentType ?? contentType },
			});
			const parsed = await resolvedCodec.deserialize(response);
			if (value instanceof FormData) {
				assert(parsed instanceof FormData);
				assert.equal(parsed.get("title"), "Hello");
				const file = parsed.get("file");
				assert(file instanceof File);
				assert.equal(file.name, "hello.txt");
				assert.equal(await file.text(), "contents");
				assert.match(response.headers.get("content-type")!, /boundary=/);
			} else if (value instanceof Blob) {
				assert(parsed instanceof Blob);
				assert.deepEqual(await parsed.arrayBuffer(), await value.arrayBuffer());
			} else if (value instanceof URLSearchParams) {
				assert(parsed instanceof URLSearchParams);
				assert.equal(parsed.toString(), value.toString());
			} else assert.deepEqual(parsed, value);
		}
	});

	it("rejects implicit conversions and preserves empty native values", async () => {
		for (const mediaType of [
			"application/x-www-form-urlencoded",
			"multipart/form-data",
			"text/plain",
			"application/octet-stream",
		]) {
			const resolvedCodec = resolveBodyCodec(mediaType, defaultBodyCodecs);
			await assert.rejects(
				async () => resolvedCodec!.serialize!({ title: "Hello" }, mediaType),
				TypeError,
			);
		}
		const json = resolveBodyCodec("application/json", defaultBodyCodecs)!;
		await assert.rejects(
			async () => json.serialize!(undefined, "application/json"),
			TypeError,
		);
		await assert.rejects(
			async () => json.deserialize!(new Response("{")),
			SyntaxError,
		);
		assert.equal(await json.deserialize!(Response.json(null)), null);
		for (const mediaType of [
			"text/plain",
			"application/x-www-form-urlencoded",
			"application/octet-stream",
		]) {
			const resolvedCodec = resolveBodyCodec(mediaType, defaultBodyCodecs)!;
			const parsed = await resolvedCodec.deserialize!(
				new Response(new Uint8Array(), {
					headers: { "content-type": mediaType },
				}),
			);
			if (typeof parsed === "string") assert.equal(parsed, "");
			else {
				assert(parsed instanceof URLSearchParams || parsed instanceof Blob);
				assert.equal(parsed.size, 0);
			}
		}
	});
});
