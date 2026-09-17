import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRouteHandler } from "@rest-rpc/node";
import { createNodeAdapter } from "../harness/node.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";
import { runRequestCodecErrorsSuite } from "./suite.ts";

runRequestCodecErrorsSuite(
	createNodeAdapter(createRequestCodecErrorsImplementations()),
);

describe("node request codecs", () => {
	it("returns parsing failures and enforces bounded defaults", async () => {
		const server = await createNodeAdapter(
			createRequestCodecErrorsImplementations(),
			{
				createHandlerOptions: { requestBodyLimit: 2 },
			},
		).start();
		try {
			const malformed = await fetch(
				`${server.origin}/request-codec-errors/json`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{",
				},
			);
			assert.equal(malformed.status, 400);
			assert.deepEqual(await malformed.json(), {
				message: "Invalid request body",
			});
			const oversized = await fetch(
				`${server.origin}/request-codec-errors/json`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{} ",
				},
			);
			assert.equal(oversized.status, 413);
			assert.deepEqual(await oversized.json(), {
				message: "Request body too large",
			});
			const chunked = await fetch(
				`${server.origin}/request-codec-errors/json`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode("{} "));
							controller.close();
						},
					}),
					duplex: "half",
				} as RequestInit & { duplex: "half" },
			);
			assert.equal(chunked.status, 413);
		} finally {
			await server.close();
		}
	});

	it("keeps IncomingMessage unconsumed for unbounded custom deserialization", async () => {
		const server = await createNodeAdapter(
			createRequestCodecErrorsImplementations(),
			{
				createHandlerOptions: {
					requestBodyLimit: 1,
					bodyCodecs: [
						{
							match: (mediaType) => mediaType === "application/json",
							deserialize: async (request) => {
								assert.equal(request.url, "/request-codec-errors/json");
								assert.equal(request.readableFlowing, null);
								await Promise.resolve();
								let bytes = 0;
								for await (const chunk of request) bytes += chunk.length;
								assert.equal(bytes, 1_048_577);
								return { count: 1, title: "custom" };
							},
						},
					],
				},
			},
		).start();
		try {
			const response = await fetch(
				`${server.origin}/request-codec-errors/json`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "x".repeat(1_048_577),
				},
			);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 1, title: "custom" });
		} finally {
			await server.close();
		}
	});

	it("propagates custom errors and rejects unsupported types before matching", async () => {
		const error = new Error("custom codec failed");
		let capturedError: unknown;
		const server = await createNodeAdapter(
			createRequestCodecErrorsImplementations(),
			{
				createHandlerOptions: {
					bodyCodecs: [
						{
							match: () => true,
							deserialize: () => {
								throw error;
							},
						},
					],
					requestValidationErrorHandler: () => {
						throw new Error("must not call validation hook");
					},
				},
				handleError: (caught, request, response) => {
					capturedError = caught;
					assert.equal(request.readableFlowing, null);
					response.statusCode = 599;
					response.end("custom error");
				},
			},
		).start();
		try {
			const rejected = await fetch(
				`${server.origin}/request-codec-errors/json`,
				{
					method: "POST",
					headers: { "content-type": "text/plain" },
					body: "hello",
				},
			);
			assert.equal(rejected.status, 415);
			assert.equal(capturedError, undefined);
			const failed = await fetch(`${server.origin}/request-codec-errors/json`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			});
			assert.equal(failed.status, 599);
			assert.equal(capturedError, error);
		} finally {
			await server.close();
		}
	});

	it("validates codec and limit configuration during setup", () => {
		const implementations = createRequestCodecErrorsImplementations();
		for (const maxBytes of [0, -1, 1.5, Infinity]) {
			assert.throws(() =>
				createRouteHandler(implementations, { requestBodyLimit: maxBytes }),
			);
		}
		assert.doesNotThrow(() =>
			createRouteHandler(implementations, {
				requestBodyLimit: 1,
				bodyCodecs: [{ match: () => false, deserialize: () => undefined }],
			}),
		);
		assert.doesNotThrow(() =>
			createRouteHandler(implementations, {
				requestBodyLimit: 1,
				bodyCodecs: [{ match: () => true, serialize: () => ({ body: "" }) }],
			}),
		);
	});
});
