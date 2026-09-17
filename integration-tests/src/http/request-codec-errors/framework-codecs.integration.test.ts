import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import type { BodyCodec } from "@rest-rpc/core";
import type { Request as ExpressRequest } from "express";
import type { FastifyRequest } from "fastify";
import { createFastifyAdapter } from "../harness/fastify.ts";
import { createNestAdapter } from "../harness/nest.ts";
import { requestCodecErrorsContract } from "./contract.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";

type FrameworkCodec = BodyCodec<ExpressRequest | FastifyRequest>;
const implementations = createRequestCodecErrorsImplementations();
const factories = [
	{
		name: "fastify",
		create: (bodyCodecs: readonly FrameworkCodec[], raw = false) =>
			createFastifyAdapter(implementations, {
				registerRoutesOptions: { bodyCodecs },
				configureApp: raw
					? (app) => {
							app.removeAllContentTypeParsers();
							app.addContentTypeParser("*", (_request, payload, done) =>
								done(null, payload),
							);
						}
					: undefined,
			}),
	},
	...(["express", "fastify"] as const).map((platform) => ({
		name: `nest ${platform}`,
		create: (bodyCodecs: readonly FrameworkCodec[], raw = false) =>
			createNestAdapter(requestCodecErrorsContract, implementations, {
				platform,
				bodyParser: !raw,
				moduleOptions: { bodyCodecs },
				configureFastify: raw
					? (app) => {
							app.removeAllContentTypeParsers();
							app.addContentTypeParser("*", (_request, payload, done) =>
								done(null, payload),
							);
						}
					: undefined,
			}),
	})),
];

const post = (origin: string, headers: Record<string, string> = {}) =>
	fetch(`${origin}/request-codec-errors/json`, {
		method: "POST",
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
		body: JSON.stringify({ count: 1, title: "parsed" }),
	});

for (const factory of factories)
	describe(`${factory.name} user request codecs`, () => {
		it("transforms the framework body using the first matching native deserializer", async () => {
			const server = await factory
				.create([
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
						deserialize: async (request) => {
							assert.equal("raw" in request, factory.name.includes("fastify"));
							assert.deepEqual(request.body, { count: 1, title: "parsed" });
							assert.equal(
								request.headers["content-type"],
								"application/json; charset=utf-8",
							);
							return { count: 2, title: "transformed" };
						},
					},
					{
						match: () => true,
						deserialize: () => {
							throw new Error("later deserializer");
						},
					},
				])
				.start();
			try {
				const response = await post(server.origin);
				assert.equal(response.status, 200);
				assert.deepEqual(await response.json(), {
					count: 2,
					title: "transformed",
				});
			} finally {
				await server.close();
			}
		});

		it("preserves parsed values when no user deserializer matches", async () => {
			const server = await factory
				.create([
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
				])
				.start();
			try {
				const response = await post(server.origin);
				assert.equal(response.status, 200);
				assert.deepEqual(await response.json(), { count: 1, title: "parsed" });
			} finally {
				await server.close();
			}
		});

		it("does not apply built-in codecs to an unparsed framework body", async () => {
			const server = await factory.create([], true).start();
			try {
				assert.equal((await post(server.origin)).status, 400);
			} finally {
				await server.close();
			}
		});

		it("lets users read the payload preserved by their framework setup", async () => {
			const server = await factory
				.create(
					[
						{
							match: () => true,
							deserialize: async (request) => {
								const payload = "raw" in request ? request.body : request;
								assert.ok(payload instanceof Readable);
								assert.equal(Readable.isDisturbed(payload), false);
								let text = "";
								for await (const chunk of payload) text += chunk.toString();
								return JSON.parse(text);
							},
						},
					],
					true,
				)
				.start();
			try {
				const response = await post(server.origin);
				assert.equal(response.status, 200);
				assert.deepEqual(await response.json(), { count: 1, title: "parsed" });
			} finally {
				await server.close();
			}
		});

		it("checks media type acceptance before invoking user matchers", async () => {
			let matches = 0;
			const server = await factory
				.create([
					{
						match: () => {
							matches++;
							return true;
						},
						deserialize: () => undefined,
					},
				])
				.start();
			try {
				const response = await post(server.origin, {
					"content-type": "text/plain",
				});
				assert.equal(response.status, 415);
				assert.equal(matches, 0);
			} finally {
				await server.close();
			}
		});

		it("validates the callback result and propagates callback failures to the framework", async () => {
			const server = await factory
				.create([
					{
						match: () => true,
						deserialize: (request) => {
							if (request.headers["x-fail"])
								throw new Error("custom codec failed");
							return { count: "invalid", title: "parsed" };
						},
					},
				])
				.start();
			try {
				assert.equal((await post(server.origin)).status, 400);
				assert.equal(
					(await post(server.origin, { "x-fail": "true" })).status,
					500,
				);
			} finally {
				await server.close();
			}
		});
	});
