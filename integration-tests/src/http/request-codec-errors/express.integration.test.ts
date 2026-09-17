import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { registerRoutes, type RegisterRoutesOptions } from "@rest-rpc/express";
import express from "express";
import { createExpressAdapter } from "../harness/express.ts";
import { listen } from "../harness/listen.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";
import { runRequestCodecErrorsSuite } from "./suite.ts";

runRequestCodecErrorsSuite(
	createExpressAdapter(createRequestCodecErrorsImplementations()),
);

describe("express user request codecs", () => {
	const start = (options: RegisterRoutesOptions, parsed = true) => {
		const app = express();
		if (parsed) app.use(express.json());
		registerRoutes(app, createRequestCodecErrorsImplementations(), options);
		app.use(
			(
				error: Error,
				_req: express.Request,
				res: express.Response,
				_next: express.NextFunction,
			) => {
				res.status(500).json({ message: error.message });
			},
		);
		return listen(createServer(app));
	};
	const post = (origin: string, contentType = "application/json") =>
		fetch(`${origin}/request-codec-errors/json`, {
			method: "POST",
			headers: { "content-type": contentType },
			body: JSON.stringify({ count: 1, title: "parsed" }),
		});

	it("transforms an already parsed body using the first matching user deserializer", async () => {
		const server = await start({
			bodyCodecs: [
				{
					match: () => false,
					deserialize: () => {
						throw new Error("unmatched");
					},
				},
				{
					match: (mediaType) => {
						assert.equal(mediaType, "application/json");
						return true;
					},
					deserialize: async (req) => {
						assert.deepEqual(req.body, { count: 1, title: "parsed" });
						assert.equal(
							req.headers["content-type"],
							"application/json; charset=utf-8",
						);
						return { ...req.body, count: 2 };
					},
				},
				{
					match: () => true,
					deserialize: () => {
						throw new Error("later deserializer");
					},
				},
			],
		});
		try {
			const response = await post(
				server.origin,
				"application/json; charset=utf-8",
			);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 2, title: "parsed" });
		} finally {
			await server.close();
		}
	});

	it("preserves the framework body when user rules supply no matching deserializer", async () => {
		const server = await start({
			bodyCodecs: [
				{
					match: () => false,
					deserialize: () => {
						throw new Error("unmatched");
					},
				},
				{
					match: () => true,
					serialize: (value) => ({ body: JSON.stringify(value) }),
				},
			],
		});
		try {
			const response = await post(server.origin);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 1, title: "parsed" });
		} finally {
			await server.close();
		}
	});

	it("does not apply built-in parsing when Express has not parsed the body", async () => {
		const server = await start({}, false);
		try {
			const response = await post(server.origin);
			assert.equal(response.status, 400);
		} finally {
			await server.close();
		}
	});

	it("lets user codecs read a stream preserved by framework setup", async () => {
		const server = await start(
			{
				bodyCodecs: [
					{
						match: () => true,
						deserialize: async (req) => {
							assert.equal(req.readableFlowing, null);
							let text = "";
							for await (const chunk of req) text += chunk.toString();
							return JSON.parse(text);
						},
					},
				],
			},
			false,
		);
		try {
			const response = await post(server.origin);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 1, title: "parsed" });
		} finally {
			await server.close();
		}
	});

	it("checks content type acceptance before invoking user matchers", async () => {
		let matched = false;
		const server = await start({
			bodyCodecs: [
				{
					match: () => {
						matched = true;
						return true;
					},
					deserialize: () => undefined,
				},
			],
		});
		try {
			const response = await post(server.origin, "text/plain");
			assert.equal(response.status, 415);
			assert.equal(matched, false);
		} finally {
			await server.close();
		}
	});

	it("validates codec results and forwards callback errors to Express", async () => {
		const server = await start({
			bodyCodecs: [
				{
					match: () => true,
					deserialize: (req) => {
						if (req.headers["x-fail"]) throw new Error("custom codec failed");
						return { count: "invalid", title: "parsed" };
					},
				},
			],
		});
		try {
			assert.equal((await post(server.origin)).status, 400);
			const response = await fetch(
				`${server.origin}/request-codec-errors/json`,
				{
					method: "POST",
					headers: { "content-type": "application/json", "x-fail": "true" },
					body: "{}",
				},
			);
			assert.equal(response.status, 500);
			assert.deepEqual(await response.json(), {
				message: "custom codec failed",
			});
		} finally {
			await server.close();
		}
	});
});
