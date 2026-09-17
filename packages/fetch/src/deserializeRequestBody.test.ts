import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as contractRoute } from "@rest-rpc/core";
import { type as schema } from "@rest-rpc/core";
import { createRouteHandler } from "./handler.ts";
import { implement } from "./index.ts";
import { deserializeRequestBody } from "./deserializeRequestBody.ts";

const request = (body: BodyInit, contentType: string = "text/plain") =>
	new Request("http://localhost/body", {
		method: "POST",
		headers: { "content-type": contentType },
		body,
	});

describe("deserializeRequestBody", () => {
	it("decodes built-in formats into native values", async () => {
		const bodyRequest1 = request('{"ok":true}', "application/problem+json");
		assert.deepEqual(
			(await deserializeRequestBody(bodyRequest1, bodyRequest1)).body,
			{ ok: true },
		);
		const bodyRequest2 = request("hello");
		assert.equal(
			(await deserializeRequestBody(bodyRequest2, bodyRequest2)).body,
			"hello",
		);
		const bodyRequest3 = request(
			"tags[]=ts&tags[]=rpc",
			"application/x-www-form-urlencoded",
		);
		const form = (await deserializeRequestBody(bodyRequest3, bodyRequest3))
			.body;
		assert(form instanceof URLSearchParams);
		assert.deepEqual(form.getAll("tags[]"), ["ts", "rpc"]);
		const multipart = new FormData();
		multipart.append("title", "hello");
		const bodyRequest4 = new Request("http://localhost/body", {
			method: "POST",
			body: multipart,
		});
		const parsed = (await deserializeRequestBody(bodyRequest4, bodyRequest4))
			.body;
		assert(parsed instanceof FormData);
		assert.equal(parsed.get("title"), "hello");
		const bodyRequest5 = request(
			new Uint8Array([0, 255]),
			"application/octet-stream",
		);
		const binary = (await deserializeRequestBody(bodyRequest5, bodyRequest5))
			.body;
		assert(binary instanceof Blob);
		assert.deepEqual(
			new Uint8Array(await binary.arrayBuffer()),
			new Uint8Array([0, 255]),
		);
	});

	it("does not read or match absent headers and absent streams", async () => {
		const source = request("hello");
		source.headers.delete("content-type");
		const codecs = [
			{
				match: () => {
					throw new Error("must not match");
				},
				deserialize: () => "custom",
			},
		];
		assert.equal(
			(await deserializeRequestBody(source, source, codecs)).body,
			undefined,
		);
		assert.equal(source.bodyUsed, false);
		const bodyRequest6 = new Request("http://localhost/body", {
			headers: { "content-type": "text/plain" },
		});
		assert.equal(
			(await deserializeRequestBody(bodyRequest6, bodyRequest6, codecs)).body,
			undefined,
		);
	});

	it("counts actual bytes even when Content-Length understates them", async () => {
		const bodyRequest7 = request("é");
		assert.equal(
			(await deserializeRequestBody(bodyRequest7, bodyRequest7, [], 2)).body,
			"é",
		);
		const source = request("é!");
		source.headers.set("content-length", "1");
		assert.equal(
			(await deserializeRequestBody(source, source, [], 2)).rejection?.status,
			413,
		);
		const bodyRequest8 = request("x".repeat(1_048_576 + 1));
		assert.equal(
			(await deserializeRequestBody(bodyRequest8, bodyRequest8)).rejection
				?.status,
			413,
		);
	});

	it("rejects oversized Content-Length before reading only for default parsing", async () => {
		const source = request("ok");
		source.headers.set("content-length", "3");
		assert.deepEqual(
			(await deserializeRequestBody(source, source, [], 2)).rejection,
			{ status: 413, message: "Request body too large" },
		);
		assert.equal(source.bodyUsed, false);
		assert.equal(source.body!.locked, false);
		assert.equal(
			(
				await deserializeRequestBody(
					source,
					source,
					[{ match: () => true, deserialize: (native) => native.text() }],
					2,
				)
			).body,
			"ok",
		);
		const exact = request("ok");
		exact.headers.set("content-length", "2");
		assert.equal(
			(await deserializeRequestBody(exact, exact, [], 2)).body,
			"ok",
		);
	});

	it("counts across chunks and cancels oversized streams", async () => {
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new Uint8Array([1, 2]));
			},
			cancel() {
				cancelled = true;
			},
		});
		const source = new Request("http://localhost/body", {
			method: "POST",
			headers: { "content-type": "application/octet-stream" },
			body: stream,
			duplex: "half",
		} as RequestInit & { duplex: "half" });
		assert.equal(
			(await deserializeRequestBody(source, source, [], 3)).rejection?.status,
			413,
		);
		assert(cancelled);
	});

	it("distinguishes malformed built-ins from empty native values", async () => {
		const bodyRequest9 = request("{", "application/json");
		assert.equal(
			(await deserializeRequestBody(bodyRequest9, bodyRequest9)).rejection
				?.status,
			400,
		);
		const bodyRequest10 = request("", "application/json");
		assert.equal(
			(await deserializeRequestBody(bodyRequest10, bodyRequest10)).rejection
				?.status,
			400,
		);
		const bodyRequest11 = request("bad", "multipart/form-data");
		assert.equal(
			(await deserializeRequestBody(bodyRequest11, bodyRequest11)).rejection
				?.status,
			400,
		);
		const bodyRequest12 = request("");
		assert.equal(
			(await deserializeRequestBody(bodyRequest12, bodyRequest12)).body,
			"",
		);
	});

	it("uses the generic source for custom codecs and the Fetch source for defaults", async () => {
		const nativeRequest = { framework: "native" };
		const rawRequest = request("hello");
		const custom = await deserializeRequestBody(
			nativeRequest,
			rawRequest,
			[
				{
					match: () => true,
					deserialize: (source) => {
						assert.equal(source, nativeRequest);
						return source.framework;
					},
				},
			],
			1,
		);
		assert.equal(custom.body, "native");
		assert.equal(rawRequest.bodyUsed, false);
		assert.equal(
			(await deserializeRequestBody(nativeRequest, rawRequest)).body,
			"hello",
		);
	});

	it("creates lazy Fetch requests only when default parsing needs them", async () => {
		const nativeRequest = { framework: "native" };
		let creations = 0;
		const rawRequest = request("hello");
		const lazyRequest = {
			contentType: "text/plain",
			toFetchRequest: () => {
				creations++;
				return rawRequest;
			},
		};
		assert.equal(
			(
				await deserializeRequestBody(
					nativeRequest,
					lazyRequest,
					[{ match: () => true, deserialize: (source) => source.framework }],
					1,
				)
			).body,
			"native",
		);
		assert.equal(creations, 0);
		assert.equal(
			(
				await deserializeRequestBody(nativeRequest, {
					...lazyRequest,
					contentType: undefined,
				})
			).body,
			undefined,
		);
		assert.equal(creations, 0);
		assert.equal(
			(await deserializeRequestBody(nativeRequest, lazyRequest)).body,
			"hello",
		);
		assert.equal(creations, 1);
		assert.equal(
			(
				await deserializeRequestBody(nativeRequest, {
					contentType: "text/plain",
					toFetchRequest: () => new Request("http://localhost"),
				})
			).body,
			undefined,
		);
	});

	it("passes the native request to custom deserializers and propagates failures", async () => {
		const source = request("hello");
		const result = await deserializeRequestBody(
			source,
			source,
			[
				{
					match: (type) => type === "text/plain",
					deserialize: (native) => {
						assert.equal(native, source);
						assert.equal(native.bodyUsed, false);
						return native.text();
					},
				},
			],
			1,
		);
		assert.equal(result.body, "hello");
		const error = new Error("custom failure");
		const bodyRequest13 = request("hello");
		await assert.rejects(
			() =>
				deserializeRequestBody(bodyRequest13, bodyRequest13, [
					{
						match: () => true,
						deserialize: () => {
							throw error;
						},
					},
				]),
			(caught) => caught === error,
		);
		const bodyRequest14 = request("xx");
		assert.equal(
			(
				await deserializeRequestBody(
					bodyRequest14,
					bodyRequest14,
					[{ match: () => false, deserialize: () => undefined }],
					1,
				)
			).rejection?.status,
			413,
		);
		const bodyRequest15 = request("xx");
		assert.equal(
			(
				await deserializeRequestBody(
					bodyRequest15,
					bodyRequest15,
					[{ match: () => true, serialize: () => ({ body: "" }) }],
					1,
				)
			).rejection?.status,
			413,
		);
	});
});

const implementations = () => {
	const contract = {
		body: contractRoute
			.post("/body")
			.body(schema<string>(), { contentType: "text/plain" })
			.response(204),
	};
	return { body: implement(contract).body.handler(() => ({ status: 204 })) };
};

describe("Fetch request codec integration", () => {
	it("validates configuration during setup", () => {
		for (const maxBytes of [
			0,
			-1,
			1.5,
			Infinity,
			NaN,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			assert.throws(() =>
				createRouteHandler(implementations(), { requestBodyLimit: maxBytes }),
			);
		}
		assert.doesNotThrow(() =>
			createRouteHandler(implementations(), {
				requestBodyLimit: 1,
				bodyCodecs: [{ match: () => false, deserialize: () => undefined }],
			}),
		);
		assert.doesNotThrow(() =>
			createRouteHandler(implementations(), {
				requestBodyLimit: 1,
				bodyCodecs: [{ match: () => true, serialize: () => ({ body: "" }) }],
			}),
		);
	});

	it("returns transport rejection before custom deserialization and validation hooks", async () => {
		const handler = createRouteHandler(implementations(), {
			bodyCodecs: [
				{
					match: () => true,
					deserialize: () => {
						throw new Error("must not parse");
					},
				},
			],
			requestValidationErrorHandler: () => {
				throw new Error("must not validate");
			},
		});
		const source = request("{", "application/json");
		const result = await handler(source);
		assert(result.matched);
		assert.equal(result.response.status, 415);
		assert.equal(source.bodyUsed, false);

		const contract = { body: contractRoute.post("/body").response(204) };
		const noBodyHandler = createRouteHandler(
			{
				body: implement(contract).body.handler(() => {
					throw new Error("must not call handler");
				}),
			},
			{
				bodyCodecs: [
					{
						match: () => true,
						deserialize: () => {
							throw new Error("must not parse");
						},
					},
				],
			},
		);
		const undeclaredBody = request("hello");
		const rejected = await noBodyHandler(undeclaredBody);
		assert(rejected.matched);
		assert.equal(rejected.response.status, 415);
		assert.equal(undeclaredBody.bodyUsed, false);
	});

	it("writes built-in rejections and allows custom policies", async () => {
		const handler = createRouteHandler(implementations(), {
			requestBodyLimit: 2,
		});
		const result = await handler(request("abc"));
		assert(result.matched);
		assert.equal(result.response.status, 413);
		assert.deepEqual(await result.response.json(), {
			message: "Request body too large",
		});
		const custom = createRouteHandler(implementations(), {
			requestBodyLimit: 1,
			bodyCodecs: [{ match: () => true, deserialize: () => "custom" }],
		});
		const success = await custom(request("hello"));
		assert(success.matched);
		assert.equal(success.response.status, 204);
	});
});
