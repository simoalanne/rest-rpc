import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route } from "@rest-rpc/core";
import z from "zod";
import {
	validateRequestSegments,
	validateResponseBody,
	validateResponseHeaders,
	validateResponseStreamChunks,
} from "./validation.ts";
import {
	RequestValidationError,
	ResponseValidationError,
} from "./validationErrors.ts";

describe("validateRequestSegments", () => {
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

		const result = await validateRequestSegments(declaration, {
			headers: {
				authorization: "Bearer token",
				shared: "raw-shared",
				requestId: "request-1",
			},
		});

		assert.deepEqual(result.headers, {
			inherited: true,
			local: true,
			shared: "local",
		});
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
			await assert.rejects(
				() => validateRequestSegments(declaration, { headers }),
				RequestValidationError,
			);
		}
	});

	it("parses JSON date strings with request body transforms", async () => {
		const result = await validateRequestSegments(
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

		assert.ok(result.body.createdAt instanceof Date);
	});

	it("rejects Date request bodies received as JSON strings", async () => {
		const wireBody = JSON.parse(
			JSON.stringify({ createdAt: new Date("2026-08-10T00:00:00.000Z") }),
		);

		await assert.rejects(
			() =>
				validateRequestSegments(
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
				),
			(error) => {
				assert(error instanceof RequestValidationError);
				assert.equal(error.issues.body.length, 1);
				return true;
			},
		);
	});

	it("parses string params and query with coercion or transforms", async () => {
		const result = await validateRequestSegments(
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

		assert.deepEqual(result, {
			body: undefined,
			headers: undefined,
			params: { id: 123 },
			query: { published: false },
		});
	});

	it("rejects numeric and boolean params or query without coercion", async () => {
		await assert.rejects(
			() =>
				validateRequestSegments(
					route
						.get("/todos/:id")
						.params(z.object({ id: z.number() }))
						.query(z.object({ published: z.boolean() }))
						.response(204)["~restrpc"],
					{
						params: { id: "123" },
						query: new URLSearchParams({ published: "true" }),
					},
				),
			(error) => {
				assert(error instanceof RequestValidationError);
				assert.equal(error.issues.params.length, 1);
				assert.equal(error.issues.query.length, 1);
				return true;
			},
		);
	});

	it("throws all schema issues grouped by request segment", async () => {
		const declaration = route
			.post("/body/:id")
			.body(z.string())
			.query(z.object({ q: z.string() }))
			.params(z.object({ id: z.string() }))
			.headers(z.object({ token: z.string() }))["~restrpc"];
		await assert.rejects(
			() => validateRequestSegments(declaration, {}),
			(error) => {
				assert(error instanceof RequestValidationError);
				for (const issues of Object.values(error.issues)) {
					assert.equal(issues.length, 1);
				}
				return true;
			},
		);
	});

	it("passes body values directly to the schema", async () => {
		const form = new FormData();
		form.append("title", "Write docs");
		for (const body of [
			new URLSearchParams("tags[]=ts&tags[]=rpc"),
			form,
			new Blob(["hello"]),
			{ title: "Write docs" },
			null,
			undefined,
		]) {
			const declaration = route.post("/body").body(
				z.unknown().transform((input) => {
					assert.equal(input, body);
					return input;
				}),
			)["~restrpc"];
			const result = await validateRequestSegments(declaration, { body });
			assert.equal(result.body, body);
		}
	});

	it("validates body schemas independently of media-type declarations and headers", async () => {
		const declaration = route.post("/body").body(
			z.string().transform((value) => value.toUpperCase()),
			{ contentType: ["image/png", "image/jpeg"] },
		)["~restrpc"];
		for (const headers of [undefined, { "content-type": "text/plain" }]) {
			assert.deepEqual(
				await validateRequestSegments(declaration, { body: "hello", headers }),
				{
					body: "HELLO",
					query: undefined,
					params: undefined,
					headers: undefined,
				},
			);
		}
		await assert.rejects(
			() => validateRequestSegments(declaration, { body: undefined }),
			RequestValidationError,
		);
	});

	it("returns undefined segments when no schemas are declared", async () => {
		const declaration = route.get("/body")["~restrpc"];
		for (const body of [undefined, { ignored: true }]) {
			assert.deepEqual(await validateRequestSegments(declaration, { body }), {
				body: undefined,
				query: undefined,
				params: undefined,
				headers: undefined,
			});
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
