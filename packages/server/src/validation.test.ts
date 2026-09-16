import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "@rest-rpc/core";
import z from "zod";
import {
	resolveCustomResponseBody,
	validateRequest,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import { ResponseValidationError } from "./validationErrors.ts";

describe("validateRequest", () => {
	it("validates inherited and local headers against raw input and merges local output last", async () => {
		const seen: unknown[] = [];
		const inherited = z
			.object({ authorization: z.string(), shared: z.string() })
			.transform((value) => {
				seen.push(value);
				return { inherited: true, shared: "inherited" };
			});
		const local = z
			.object({ shared: z.string(), requestId: z.string() })
			.transform((value) => {
				seen.push(value);
				return { local: true, shared: "local" };
			});
		const declaration = {
			...route.get("/headers").response(204)["~restrpc"],
			request: { headers: { inherited, local } },
		};

		const result = await validateRequest(declaration, {
			headers: {
				authorization: "Bearer token",
				shared: "raw-shared",
				requestId: "request-1",
			},
		});

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data.headers, {
				inherited: true,
				local: true,
				shared: "local",
			});
		}
		assert.deepEqual(seen, [
			{ authorization: "Bearer token", shared: "raw-shared" },
			{ shared: "raw-shared", requestId: "request-1" },
		]);
	});

	it("rejects a request when either inherited or local header validation fails", async () => {
		const declaration = {
			...route.get("/headers").response(204)["~restrpc"],
			request: {
				headers: {
					inherited: z.object({ authorization: z.string() }),
					local: z.object({ requestId: z.string() }),
				},
			},
		};

		for (const headers of [
			{ requestId: "request-1" },
			{ authorization: "Bearer token" },
		]) {
			const result = await validateRequest(declaration, { headers });
			assert.equal(result.success, false);
		}
	});

	it("parses JSON date strings with request body transforms", async () => {
		const result = await validateRequest(
			route
				.post("/todos")
				.body(
					z.object({
						createdAt: z.iso.datetime().transform((value) => new Date(value)),
					}),
				)
				.response(204)["~restrpc"],
			{
				body: { createdAt: "2026-08-10T00:00:00.000Z" },
				headers: { "content-type": "application/json" },
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
			route
				.post("/todos")
				.body(
					z.object({
						createdAt: z.date(),
					}),
				)
				.response(204)["~restrpc"],
			{
				body: wireBody,
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.issues.body.length, 1);
		}
	});

	it("parses string params and query with coercion or transforms", async () => {
		const result = await validateRequest(
			route
				.get("/todos/:id")
				.params(z.object({ id: z.coerce.number<number>() }))
				.query(
					z.object({
						published: z
							.enum(["true", "false"])
							.transform((value) => value === "true"),
					}),
				)
				.response(204)["~restrpc"],
			{
				params: { id: "123" },
				query: new URLSearchParams({ published: "false" }),
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				params: { id: 123 },
				query: { published: false },
			});
		}
	});

	it("rejects numeric and boolean params or query without coercion", async () => {
		const result = await validateRequest(
			route
				.get("/todos/:id")
				.params(z.object({ id: z.number() }))
				.query(z.object({ published: z.boolean() }))
				.response(204)["~restrpc"],
			{
				params: { id: "123" },
				query: new URLSearchParams({ published: "true" }),
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.equal(result.issues.params.length, 1);
			assert.equal(result.issues.query.length, 1);
		}
	});

	it("returns custom request bodies and selected content type separately", async () => {
		const result = await validateRequest(
			route
				.post("/images")
				.body(
					z.string().transform((value) => value.toUpperCase()),
					{ contentType: ["image/png", "image/jpeg"] },
				)
				.response(204)["~restrpc"],
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
				body: "JPEG BYTES",
				contentType: "image/jpeg",
			});
		}
	});

	it("enforces a single explicitly declared custom body content type", async () => {
		const result = await validateRequest(
			route
				.post("/text")
				.body(z.string(), { contentType: "text/plain" })
				.response(204)["~restrpc"],
			{
				body: "valid text",
				headers: { "content-type": "text/markdown" },
			},
		);

		assert.equal(result.success, false);
		if (!result.success) {
			assert.deepEqual(result.issues.body, [
				{ message: "Unsupported custom body contentType." },
			]);
		}
	});

	it("validates urlencoded form bodies from URLSearchParams", async () => {
		const result = await validateRequest(
			route
				.post("/forms")
				.body(
					z.object({
						title: z.string(),
						count: z.coerce.number<number>(),
						remember: z.string().optional(),
					}),
					{ contentType: "application/x-www-form-urlencoded" },
				)
				.response(204)["~restrpc"],
			{
				body: new URLSearchParams([
					["title", "Write docs"],
					["count", "3"],
				]),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				body: {
					title: "Write docs",
					count: 3,
				},
				contentType: "application/x-www-form-urlencoded",
			});
		}
	});

	it("validates urlencoded form arrays from empty-bracket fields", async () => {
		const result = await validateRequest(
			route
				.post("/forms")
				.body(
					z.object({
						title: z.string(),
						tags: z.array(z.string()),
					}),
					{ contentType: "application/x-www-form-urlencoded" },
				)
				.response(204)["~restrpc"],
			{
				body: new URLSearchParams([
					["title", "First"],
					["title", "Second"],
					["tags[]", "ts"],
					["tags[]", "rpc"],
				]),
				headers: {
					"content-type": "application/x-www-form-urlencoded",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.deepEqual(result.data, {
				body: {
					title: "Second",
					tags: ["ts", "rpc"],
				},
				contentType: "application/x-www-form-urlencoded",
			});
		}
	});

	it("validates multipart bodies from FormData", async () => {
		const file = new Blob(["hello"], { type: "text/plain" });
		const body = new FormData();
		body.set("title", "Write docs");
		body.set("count", "3");
		body.set("file", file);
		body.append("tags[]", "ts");
		body.append("tags[]", "rpc");

		const result = await validateRequest(
			route
				.post("/uploads")
				.body(
					z.object({
						title: z.string(),
						count: z.coerce.number<number>(),
						file: z.instanceof(Blob),
						tags: z.array(z.string()),
					}),
					{ contentType: "multipart/form-data" },
				)
				.response(204)["~restrpc"],
			{
				body,
				headers: {
					"content-type": "multipart/form-data",
				},
			},
		);

		assert.equal(result.success, true);
		if (result.success) {
			assert.equal(result.data.body.title, "Write docs");
			assert.equal(result.data.body.count, 3);
			assert.ok(result.data.body.file instanceof Blob);
			assert.deepEqual(result.data.body.tags, ["ts", "rpc"]);
		}
	});
});

describe("validateResponseBody", () => {
	it("validates response bodies", async () => {
		await assert.rejects(
			validateResponseBody(z.number(), "id,title\n1,First\n"),
			(error) => {
				assert.ok(error instanceof ResponseValidationError);
				assert.equal(error.location, "body");
				return true;
			},
		);
	});
});

describe("validateResponseHeaders", () => {
	it("validates and transforms unconstrained response-header input", async () => {
		const result = await validateResponseHeaders(
			{
				body: z.object({ id: z.string() }),
				headers: z.string().transform((value) => ({ etag: value })),
			},
			"todo-etag",
		);

		assert.deepEqual(result, { etag: "todo-etag" });
	});

	it("normalizes declared response headers", async () => {
		assert.deepEqual(
			await validateResponseHeaders(
				{
					body: z.object({ id: z.string() }),
					headers: z.object({
						etag: z.string(),
						"x-optional": z.string().optional(),
					}),
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

	it("throws response header validation errors", async () => {
		await assert.rejects(
			validateResponseHeaders(
				{
					body: z.object({ id: z.string() }),
					headers: z.object({ etag: z.string() }),
				},
				{},
			),
			(error) => {
				assert.ok(error instanceof ResponseValidationError);
				assert.equal(error.location, "headers");
				assert.equal(error.issues.length, 1);
				return true;
			},
		);
	});
});

describe("resolveCustomResponseBody", () => {
	it("resolves declared custom response content types", () => {
		assert.deepEqual(
			resolveCustomResponseBody(
				["image/png", "image/jpeg"],
				"jpeg bytes",
				"image/jpeg",
				"Unsupported custom response body contentType.",
			),
			{
				contentType: "image/jpeg",
				body: "jpeg bytes",
			},
		);
	});

	it("rejects undeclared custom response content types", () => {
		assert.throws(
			() =>
				resolveCustomResponseBody(
					["image/png", "image/jpeg"],
					"webp bytes",
					"image/webp",
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

		const chunks = validateResponseStreamChunks(rows(), z.number());

		await assert.rejects(
			async () => {
				for await (const _chunk of chunks) {
					void _chunk;
				}
			},
			(error) => {
				assert.ok(error instanceof ResponseValidationError);
				assert.equal(error.location, "stream");
				assert.equal(error.issues.length, 1);
				return true;
			},
		);
	});
});
