import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customBody, jsonQuery, stream } from "@rest-rpc/core/contract";
import z from "zod";
import {
	resolveCustomResponseBody,
	validateRequest,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";

describe("validateRequest", () => {
	it("parses JSON date strings with request body transforms", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/todos",
				body: z.object({
					createdAt: z.iso.datetime().transform((value) => new Date(value)),
				}),
				requestKeys: {
					createdAt: "body",
				},
				responses: {},
			},
			{
				body: { createdAt: "2026-08-10T00:00:00.000Z" },
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.ok(result.data.body.createdAt instanceof Date);
		}
	});

	it("rejects Date request bodies received as JSON strings", async () => {
		const wireBody = JSON.parse(
			JSON.stringify({ createdAt: new Date("2026-08-10T00:00:00.000Z") }),
		);

		const result = await validateRequest(
			{
				method: "POST",
				path: "/todos",
				body: z.object({
					createdAt: z.date(),
				}),
				requestKeys: {
					createdAt: "body",
				},
				responses: {},
			},
			{
				body: wireBody,
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.response.body.validationErrors.length, 1);
		}
	});

	it("parses string params and query with coercion or transforms", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos/:id",
				pathParams: {
					id: z.coerce.number(),
				},
				query: {
					published: z
						.enum(["true", "false"])
						.transform((value) => value === "true"),
				},
				requestKeys: {
					id: "pathParams",
					published: "query",
				},
				responses: {},
			},
			{
				pathParams: { id: "123" },
				query: { published: "false" },
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				pathParams: { id: 123 },
				query: { published: false },
			});
		}
	});

	it("rejects numeric and boolean params or query without coercion", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos/:id",
				pathParams: {
					id: z.number(),
				},
				query: {
					published: z.boolean(),
				},
				requestKeys: {
					id: "pathParams",
					published: "query",
				},
				responses: {},
			},
			{
				pathParams: { id: "123" },
				query: { published: "true" },
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.response.body.validationErrors.length, 2);
		}
	});

	it("parses JSON query values before schema validation", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos",
				query: jsonQuery(
					z.object({
						page: z.number(),
						filters: z.object({ tags: z.array(z.string()) }),
					}),
				),
				requestKeys: {},
				responses: {},
			},
			{
				query: {
					query: JSON.stringify({
						page: 2,
						filters: { tags: ["api", "typescript"] },
					}),
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				query: { page: 2, filters: { tags: ["api", "typescript"] } },
			});
		}
	});

	it("allows omitted optional JSON query values", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos",
				query: jsonQuery(z.object({ page: z.number() }).optional()),
				requestKeys: {},
				responses: {},
			},
			{},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, { query: undefined });
		}
	});

	it("wraps custom request bodies with selected content type", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/images",
				body: customBody({
					contentType: ["image/png", "image/jpeg"],
					schema: z.string().transform((value) => value.toUpperCase()),
				}),
				requestKeys: {},
				responses: {},
			},
			{
				body: "jpeg bytes",
				headers: {
					"content-type": "image/jpeg; charset=binary",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				body: {
					contentType: "image/jpeg",
					payload: "JPEG BYTES",
				},
			});
		}
	});

	it("validates custom request bodies without content type as payloads", async () => {
		const result = await validateRequest(
			{
				method: "POST",
				path: "/forms",
				body: customBody(z.instanceof(URLSearchParams)),
				requestKeys: {},
				responses: {},
			},
			{
				body: new URLSearchParams([["title", "Write docs"]]),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.ok(result.data.body instanceof URLSearchParams);
			assert.equal(result.data.body.get("title"), "Write docs");
		}
	});

	it("rejects malformed JSON query values as request validation errors", async () => {
		const result = await validateRequest(
			{
				method: "GET",
				path: "/todos",
				query: jsonQuery(z.object({ page: z.number() })),
				requestKeys: {},
				responses: {},
			},
			{
				query: { query: "{" },
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.deepEqual(result.response.body.validationErrors, [
				{ message: 'Invalid JSON query parameter "query".' },
			]);
		}
	});
});

describe("validateResponseBody", () => {
	it("validates custom response bodies", async () => {
		await assert.rejects(
			validateResponseBody(
				customBody({
					contentType: "text/csv",
					schema: z.number(),
				}),
				"id,title\n1,First\n",
			),
		);
	});
});

describe("validateResponseHeaders", () => {
	it("normalizes declared response headers", async () => {
		assert.deepEqual(
			await validateResponseHeaders(
				{
					body: z.object({ id: z.string() }),
					headers: {
						etag: z.string(),
						"x-optional": z.string().optional(),
					},
				},
				{
					etag: "todo-etag",
					"x-optional": undefined,
				},
			),
			{
				etag: "todo-etag",
			},
		);
	});

	it("rejects declared response header values that are not scalar", async () => {
		await assert.rejects(
			validateResponseHeaders(
				{
					body: z.object({ id: z.string() }),
					headers: {
						"x-meta": z.object({ id: z.string() }),
					},
				},
				{
					"x-meta": { id: "meta-1" },
				},
			),
			/Declared response header "x-meta" must resolve to a string or number/,
		);
	});

	it("rejects array values for declared response headers", async () => {
		await assert.rejects(
			validateResponseHeaders(
				{
					body: z.object({ id: z.string() }),
					headers: {
						"x-tags": z.array(z.string()),
					},
				},
				{
					"x-tags": ["alpha", "beta"],
				},
			),
			/Declared response header "x-tags" must resolve to a string or number/,
		);
	});
});

describe("resolveCustomResponseBody", () => {
	it("resolves declared custom response content types", () => {
		assert.deepEqual(
			resolveCustomResponseBody(
				customBody({
					contentType: ["image/png", "image/jpeg"],
					schema: z.string(),
				}),
				{
					contentType: "image/jpeg",
					payload: "jpeg bytes",
				},
				"Unsupported custom response body contentType.",
			),
			{
				contentType: "image/jpeg",
				payload: "jpeg bytes",
			},
		);
	});

	it("rejects undeclared custom response content types", () => {
		assert.throws(
			() =>
				resolveCustomResponseBody(
					customBody({
						contentType: ["image/png", "image/jpeg"],
						schema: z.string(),
					}),
					{
						contentType: "image/webp",
						payload: "webp bytes",
					},
					"Unsupported custom response body contentType.",
				),
			/Unsupported custom response body contentType/,
		);
	});
});

describe("validateResponseStreamChunks", () => {
	it("validates streamed response chunks", async () => {
		async function* rows() {
			yield "id,title\n";
		}

		const chunks = validateResponseStreamChunks(
			rows(),
			stream(
				customBody({
					contentType: "text/csv",
					schema: z.number(),
				}),
			),
		);

		await assert.rejects(async () => {
			for await (const _chunk of chunks) {
				_chunk;
			}
		}, /Stream response validation failed/);
	});
});
