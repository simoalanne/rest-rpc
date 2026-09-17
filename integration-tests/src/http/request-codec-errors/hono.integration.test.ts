import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerRoutes } from "@rest-rpc/hono";
import { Hono } from "hono";
import { createHonoAdapter } from "../harness/hono.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";
import { runRequestCodecErrorsSuite } from "./suite.ts";

runRequestCodecErrorsSuite(
	createHonoAdapter(createRequestCodecErrorsImplementations()),
);

describe("hono request codecs", () => {
	it("returns a parsing 400 when the default JSON parser fails", async () => {
		const app = new Hono();
		registerRoutes(app, createRequestCodecErrorsImplementations());

		const response = await app.fetch(
			new Request("http://127.0.0.1/request-codec-errors/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
		);

		assert.equal(response.status, 400);
		assert.match(
			response.headers.get("content-type") ?? "",
			/^application\/json/,
		);
		assert.deepEqual(await response.json(), {
			message: "Invalid request body",
		});
	});

	it("enforces default byte limits and rejects oversized hints before reading", async () => {
		const app = new Hono();
		registerRoutes(app, createRequestCodecErrorsImplementations(), {
			requestBodyLimit: 2,
		});
		for (const headers of [
			{ "content-type": "application/json" },
			{ "content-type": "application/json", "content-length": "3" },
		]) {
			const source = new Request("http://127.0.0.1/request-codec-errors/json", {
				method: "POST",
				headers,
				body: "{} ",
			});
			const response = await app.fetch(source);
			assert.equal(response.status, 413);
			assert.deepEqual(await response.json(), {
				message: "Request body too large",
			});
			if ("content-length" in headers) assert.equal(source.bodyUsed, false);
		}
	});

	it("passes the original HonoRequest to custom deserializers without bounds", async () => {
		const app = new Hono();
		const source = new Request("http://127.0.0.1/request-codec-errors/json", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"content-length": "2000000",
			},
			body: "x".repeat(1_048_577),
		});
		registerRoutes(app, createRequestCodecErrorsImplementations(), {
			requestBodyLimit: 1,
			bodyCodecs: [
				{
					match: (mediaType) => mediaType === "application/json",
					deserialize: async (native) => {
						assert.equal(native.raw, source);
						assert.equal(native.path, "/request-codec-errors/json");
						assert.equal(native.raw.bodyUsed, false);
						assert.equal((await native.text()).length, 1_048_577);
						return { count: 1, title: "custom" };
					},
				},
			],
		});
		const response = await app.fetch(source);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { count: 1, title: "custom" });
	});

	it("rejects unsupported types before custom matching and validates configuration", async () => {
		const app = new Hono();
		const implementations = createRequestCodecErrorsImplementations();
		for (const maxBytes of [0, -1, 1.5, Infinity]) {
			assert.throws(() =>
				registerRoutes(app, implementations, { requestBodyLimit: maxBytes }),
			);
		}
		assert.doesNotThrow(() =>
			registerRoutes(app, implementations, {
				requestBodyLimit: 1,
				bodyCodecs: [{ match: () => false, deserialize: () => undefined }],
			}),
		);
		registerRoutes(app, implementations, {
			bodyCodecs: [
				{
					match: () => {
						throw new Error("must not match");
					},
					deserialize: () => undefined,
				},
			],
			requestValidationErrorHandler: () => {
				throw new Error("must not call validation hook");
			},
		});
		const source = new Request("http://127.0.0.1/request-codec-errors/json", {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: "hello",
		});
		const response = await app.fetch(source);
		assert.equal(response.status, 415);
		assert.equal(source.bodyUsed, false);
	});

	it("lets custom deserializer errors propagate", async () => {
		const app = new Hono();
		let capturedError: unknown;
		app.onError((error) => {
			capturedError = error;
			return new Response("custom error handler", { status: 599 });
		});
		registerRoutes(app, createRequestCodecErrorsImplementations(), {
			bodyCodecs: [
				{
					match: () => true,
					deserialize: () => {
						throw new Error("custom parser failed");
					},
				},
			],
		});

		const response = await app.fetch(
			new Request("http://127.0.0.1/request-codec-errors/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			}),
		);

		assert.equal(response.status, 599);
		assert.equal(await response.text(), "custom error handler");
		assert.equal((capturedError as Error).message, "custom parser failed");
	});
});
