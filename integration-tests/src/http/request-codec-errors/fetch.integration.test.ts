import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRouteHandler } from "@rest-rpc/fetch";
import { createFetchAdapter } from "../harness/fetch.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";
import { runRequestCodecErrorsSuite } from "./suite.ts";

runRequestCodecErrorsSuite(
	createFetchAdapter(createRequestCodecErrorsImplementations()),
);

describe("fetch request codec errors", () => {
	it("rejects unsupported media types before parsing or validation hooks", async () => {
		const handler = createRouteHandler(
			createRequestCodecErrorsImplementations(),
			{
				bodyCodecs: [
					{
						match: () => true,
						deserialize: () => {
							throw new Error("Parser must not run");
						},
					},
				],
				requestValidationErrorHandler: () => {
					throw new Error("Validation hook must not run");
				},
			},
		);
		const request = new Request("http://127.0.0.1/request-codec-errors/json", {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: "{",
		});
		const result = await handler(request);
		assert(result.matched);
		assert.equal(result.response.status, 415);
		assert.equal(request.bodyUsed, false);
	});

	it("returns a parsing 400 when the default JSON parser fails", async () => {
		const handler = createRouteHandler(
			createRequestCodecErrorsImplementations(),
		);
		const result = await handler(
			new Request("http://127.0.0.1/request-codec-errors/json", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
		);
		assert(result.matched);
		const response = result.response;

		assert.equal(response.status, 400);
		assert.match(
			response.headers.get("content-type") ?? "",
			/^application\/json/,
		);
		assert.deepEqual(await response.json(), {
			message: "Invalid request body",
		});
	});

	it("lets custom deserializer errors propagate", async () => {
		const handler = createRouteHandler(
			createRequestCodecErrorsImplementations(),
			{
				bodyCodecs: [
					{
						match: () => true,
						deserialize: () => {
							throw new Error("custom parser failed");
						},
					},
				],
			},
		);

		await assert.rejects(
			() =>
				handler(
					new Request("http://127.0.0.1/request-codec-errors/json", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
					}),
				),
			/custom parser failed/,
		);
	});
});
