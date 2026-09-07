import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { createRouteHandler, defaultBodyParser } from "@rest-rpc/fetch";
import { listen } from "../harness/listen.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

const withoutBody = (method: string | undefined) =>
	method === "GET" || method === "HEAD";

runBodyParsingSuite({
	name: "fetch",
	start: async () => {
		const handler = createRouteHandler(createBodyParsingImplementations());

		return listen(
			createServer(async (req, res) => {
				const request = new Request(`http://127.0.0.1${req.url}`, {
					method: req.method,
					headers: req.headers as HeadersInit,
					body: withoutBody(req.method) ? undefined : Readable.toWeb(req),
					duplex: "half",
				} as RequestInit & { duplex: "half" });
				const result = await handler(request);
				assert(result.matched);
				const response = result.response;

				res.writeHead(response.status, Object.fromEntries(response.headers));
				if (response.body) {
					for await (const chunk of response.body) res.write(chunk);
				}
				res.end();
			}),
		);
	},
});

describe("fetch default body parser errors", () => {
	it("returns a parsing 400 when the default JSON parser fails", async () => {
		const handler = createRouteHandler(createBodyParsingImplementations());
		const result = await handler(
			new Request("http://127.0.0.1/body-parsing/json", {
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

	it("lets custom body parser errors propagate", async () => {
		const handler = createRouteHandler(createBodyParsingImplementations(), {
			bodyParser: () => {
				throw new Error("custom parser failed");
			},
		});

		await assert.rejects(
			() =>
				handler(
					new Request("http://127.0.0.1/body-parsing/json", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}",
					}),
				),
			/custom parser failed/,
		);
	});
});

describe("fetch default body parser content types", () => {
	it("parses structured JSON content types", async () => {
		const request = new Request("http://127.0.0.1/body", {
			method: "POST",
			headers: { "content-type": "application/problem+json; charset=utf-8" },
			body: JSON.stringify({ title: "Invalid request" }),
		});

		assert.deepEqual(await defaultBodyParser(request), {
			title: "Invalid request",
		});
	});

	it("uses bytes for unrecognized content types", async () => {
		const request = new Request("http://127.0.0.1/body", {
			method: "POST",
			headers: { "content-type": "application/x-custom" },
			body: new Uint8Array([0, 127, 255]),
		});

		assert.deepEqual(
			await defaultBodyParser(request),
			new Uint8Array([0, 127, 255]),
		);
	});

	it("returns undefined when the request has no body", async () => {
		assert.equal(
			await defaultBodyParser(new Request("http://127.0.0.1/body")),
			undefined,
		);
	});
});
