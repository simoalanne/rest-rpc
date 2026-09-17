import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { route } from "../contract/routeBuilder.ts";
import { initClient } from "./initClient.ts";

const baseUrl = "https://api.test";

describe("client body codecs", () => {
	it("overrides JSON in both directions with async codecs and merges headers case-insensitively", async () => {
		const input = z.object({ title: z.string() });
		const api = {
			echo: route
				.post("/echo")
				.body(input)
				.headers(z.object({ "x-version": z.string() }))
				.response(
					200,
					z
						.object({ title: z.string() })
						.transform(({ title }) => title.toUpperCase()),
					{
						headers: z.object({ "x-count": z.coerce.number<number>() }),
					},
				),
		};
		const response = new Response("encoded reply", {
			headers: {
				"content-type": "Application/JSON; charset=utf-8",
				"x-count": "2",
			},
		});
		const client = initClient(api, {
			baseUrl,
			validateResponses: true,
			getGlobalHeaders: () => ({ "X-Version": "global", "X-Global": "kept" }),
			bodyCodecs: [
				{
					match: (mediaType) => mediaType === "application/json",
					async serialize(value, declaredContentType) {
						assert.equal(declaredContentType, "application/json");
						return {
							body: input.parse(value).title,
							headers: {
								"X-Version": "codec",
								"X-Count": 3,
								"X-Omitted": undefined,
							},
							contentType: "application/json; charset=utf-8",
						};
					},
					async deserialize(source) {
						assert.equal(source, response);
						assert.equal(source.bodyUsed, false);
						assert.equal(
							source.headers.get("content-type"),
							"Application/JSON; charset=utf-8",
						);
						return { title: await source.text() };
					},
				},
			],
			fetch: async (_url, init) => {
				assert.equal(init?.body, "hello");
				assert.deepEqual(init?.headers, {
					"x-version": "route",
					"x-global": "kept",
					"x-count": "3",
					"content-type": "application/json; charset=utf-8",
				});
				return response;
			},
		});
		const result = await client.echo({
			body: { title: "hello" },
			headers: { "x-version": "route" },
		});
		assert.equal(result.body, "ENCODED REPLY");
		assert.deepEqual(result.responseHeaders, { "x-count": 2 });
		assert.equal("contentType" in result, false);
	});

	it("allows declared structured JSON types but does not widen application/json acceptance", async () => {
		const received = "application/problem+json; charset=utf-8";
		const api = {
			allowed: route
				.get("/allowed")
				.response(200, z.object({ detail: z.string() }), {
					contentType: "application/problem+json",
				}),
			rejected: route
				.get("/rejected")
				.response(200, z.object({ detail: z.string() })),
		};
		const client = initClient(api, {
			baseUrl,
			fetch: async () =>
				new Response('{"detail":"problem"}', {
					headers: { "content-type": received },
				}),
		});
		assert.deepEqual((await client.allowed()).body, { detail: "problem" });
		await assert.rejects(
			client.rejected(),
			/unsupported response content-type/,
		);
	});

	it("validates missing-header undefined values without reading the source or resolving codecs", async () => {
		const response = new Response(new Uint8Array([1]));
		const client = initClient(
			{ optional: route.get("/optional").response(200, z.string().optional()) },
			{
				baseUrl,
				validateResponses: true,
				fetch: async () => response,
				bodyCodecs: [
					{
						match: () => {
							throw new Error("Must not match");
						},
						deserialize: () => "wrong",
					},
				],
			},
		);
		assert.equal((await client.optional()).body, undefined);
		assert.equal(response.bodyUsed, false);
		const required = initClient(
			{ required: route.get("/required").response(200, z.string()) },
			{
				baseUrl,
				validateResponses: true,
				fetch: async () => new Response(null),
			},
		);
		await assert.rejects(required.required());
	});

	it("decodes present bodies without schemas and bypasses codecs for null bodies", async () => {
		for (const validateResponses of [false, true]) {
			const response = new Response("unexpected bytes", {
				headers: { "content-type": "application/json" },
			});
			const api = {
				empty: route.get("/empty").response(200),
				noContent: route.get("/no-content").response(204),
			};
			const client = initClient(api, {
				baseUrl,
				validateResponses,
				bodyCodecs: [
					{
						match: () => {
							return true;
						},
						deserialize: () => "wrong",
					},
				],
				fetch: async (url) =>
					String(url).endsWith("/empty")
						? response
						: new Response(null, { status: 204 }),
			});
			assert.equal((await client.empty()).body, "wrong");
			assert.equal(response.bodyUsed, false);
			assert.equal((await client.noContent()).body, undefined);
		}
	});

	it("validates null bodies independently of HTTP status", async () => {
		const client = initClient(
			{
				required: route.get("/required").response(204, z.string()),
				optional: route.get("/optional").response(
					204,
					z
						.string()
						.optional()
						.transform((value) => value ?? "absent"),
				),
			},
			{
				baseUrl,
				validateResponses: true,
				fetch: async () => new Response(null, { status: 204 }),
			},
		);
		await assert.rejects(client.required());
		assert.equal((await client.optional()).body, "absent");
	});

	it("requires NDJSON headers and a body stream in both validation modes", async () => {
		for (const validateResponses of [false, true]) {
			for (const contentType of [undefined, "application/json"]) {
				const response = new Response("{}", {
					headers: contentType ? { "content-type": contentType } : {},
				});
				const client = initClient(
					{
						events: route.get("/events").streamResponse(200, z.object({})),
					},
					{ baseUrl, validateResponses, fetch: async () => response },
				);
				await assert.rejects(
					client.events(),
					/unsupported stream content-type/,
				);
				assert.equal(response.bodyUsed, false);
			}
			const client = initClient(
				{
					events: route.get("/events").streamResponse(200, z.object({})),
				},
				{
					baseUrl,
					validateResponses,
					fetch: async () =>
						new Response(null, {
							headers: {
								"content-type": "Application/X-NDJSON; charset=utf-8",
							},
						}),
				},
			);
			await assert.rejects(client.events(), /no stream body/);
		}
	});

	it("parses generated contracts from received headers without runtime body schemas", async () => {
		const generated = {
			value: {
				"~restrpc": {
					source: "generated",
					kind: "http",
					method: "GET",
					path: "/value",
					output: "response",
					responses: { 200: {} },
				},
			},
		};
		const client = initClient(generated as never, {
			baseUrl,
			validateResponses: true,
			fetch: async () =>
				new Response("hello", { headers: { "content-type": "text/plain" } }),
		}) as unknown as { value: () => Promise<{ body: unknown }> };
		assert.equal((await client.value()).body, "hello");
	});

	it("rejects undeclared outgoing selections and reserved typed headers before fetch", async () => {
		const api = {
			value: route
				.post("/value")
				.body(z.instanceof(Blob), { contentType: ["image/png", "image/jpeg"] })
				.response(204),
		};
		const client = initClient(api, {
			baseUrl,
			fetch: async () => {
				throw new Error("Must not fetch");
			},
		});
		await assert.rejects(
			client.value({ body: new Blob() }, {
				contentType: "image/webp",
			} as never),
			/Unsupported request contentType/,
		);
		await assert.rejects(
			client.value({ body: new Blob() }, undefined as never),
			/contentType option is required/,
		);
		const headersClient = initClient(
			{
				value: route
					.post("/value")
					.headers(z.object({ "Content-Type": z.string() }))
					.response(204),
			},
			{
				baseUrl,
				fetch: async () => {
					throw new Error("Must not fetch");
				},
			},
		);
		await assert.rejects(
			headersClient.value({ headers: { "Content-Type": "application/json" } }),
			/content-type/,
		);
	});

	it("checks serialized headers and media-type directives before Fetch delivery", async () => {
		const api = {
			value: route
				.post("/value")
				.body(z.string(), { contentType: "text/plain" })
				.response(204),
		};
		for (const headers of [
			{ "Content-Type": "bad" },
			{ "CONTENT-Length": "1" },
			{ "transfer-encoding": "chunked" },
		]) {
			const client = initClient(api, {
				baseUrl,
				bodyCodecs: [
					{ match: () => true, serialize: () => ({ body: "", headers }) },
				],
				fetch: async () => {
					throw new Error("Must not fetch");
				},
			});
			await assert.rejects(client.value({ body: "hello" }), /Codec headers/);
		}
		const changedProtocol = initClient(api, {
			baseUrl,
			bodyCodecs: [
				{
					match: () => true,
					serialize: () => ({ body: "", contentType: "application/json" }),
				},
			],
			fetch: async () => {
				throw new Error("Must not fetch");
			},
		});
		await assert.rejects(
			changedProtocol.value({ body: "hello" }),
			/base media type/,
		);
		for (const contentType of [undefined, null, "text/plain; charset=utf-8"]) {
			const client = initClient(api, {
				baseUrl,
				bodyCodecs: [
					{
						match: () => true,
						serialize: () => ({ body: "wire", contentType }),
					},
				],
				fetch: async (_url, init) => {
					assert.equal(init?.body, "wire");
					assert.equal(
						new Headers(init?.headers).get("content-type"),
						contentType === undefined ? "text/plain" : contentType,
					);
					return new Response(null, { status: 204 });
				},
			});
			await client.value({ body: "hello" });
		}
	});

	it("propagates codec failures and keeps declared NDJSON on its streaming path", async () => {
		const failure = new Error("Codec failed");
		const input = {
			value: route.post("/value").body(z.string()).response(204),
		};
		const sending = initClient(input, {
			baseUrl,
			bodyCodecs: [
				{
					match: () => true,
					serialize: () => {
						throw failure;
					},
				},
			],
			fetch: async () => {
				throw new Error("Must not fetch");
			},
		});
		await assert.rejects(
			sending.value({ body: "hello" }),
			(error) => error === failure,
		);
		const receiving = initClient(
			{ value: route.get("/value").response(200, z.string()) },
			{
				baseUrl,
				bodyCodecs: [
					{
						match: () => true,
						deserialize: () => {
							throw failure;
						},
					},
				],
				fetch: async () => Response.json("hello"),
			},
		);
		await assert.rejects(receiving.value(), (error) => error === failure);
		const streaming = initClient(
			{
				events: route
					.get("/events")
					.streamResponse(200, z.object({ id: z.number() })),
			},
			{
				baseUrl,
				bodyCodecs: [
					{
						match: () => {
							throw new Error("Must bypass codecs");
						},
						deserialize: () => "wrong",
					},
				],
				fetch: async () =>
					new Response('{"id":1}\n', {
						headers: { "content-type": "application/x-ndjson" },
					}),
			},
		);
		const items = [];
		for await (const item of (await streaming.events()).body) items.push(item);
		assert.deepEqual(items, [{ id: 1 }]);
	});
});
