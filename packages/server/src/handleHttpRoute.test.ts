import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customBody, noBody, stream } from "@rest-rpc/core/contract";
import z from "zod";
import { ContractResponseError } from "./contractResponseError.ts";
import { handleHttpRoute } from "./handleHttpRoute.ts";

const routeWithDeclaredErrorResponse = {
	method: "GET",
	path: "/todos/:id",
	responses: {
		200: z.object({ id: z.string() }),
		404: z.object({ code: z.literal("not_found") }),
	},
} as const;

describe("handleHttpRoute", () => {
	it("passes validated request data and context to the handler", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos/:id",
				pathParams: {
					id: z.coerce.number(),
				},
				requestKeys: {
					id: "pathParams",
				},
				responses: {
					200: z.object({ id: z.number() }),
				},
			},
			(request) => {
				assert.deepEqual(request, {
					id: 123,
					context: { requestId: "request-1" },
				});

				return { id: request.id };
			},
			{
				request: {
					pathParams: { id: "123" },
				},
				context: { requestId: "request-1" },
			},
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 200,
			headers: undefined,
			body: { id: 123 },
		});
	});

	it("returns request validation errors without calling the handler", async () => {
		let called = false;
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos/:id",
				pathParams: {
					id: z.number(),
				},
				requestKeys: {
					id: "pathParams",
				},
				responses: {
					204: noBody(),
				},
			},
			() => {
				called = true;
			},
			{
				request: {
					pathParams: { id: "123" },
				},
				context: {},
			},
		);

		assert.equal(called, false);
		assert.equal(result.kind, "json");
		assert.equal(result.status, 400);
	});

	it("uses custom request validation error responses", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos/:id",
				pathParams: {
					id: z.number(),
				},
				requestKeys: {
					id: "pathParams",
				},
				responses: {
					204: noBody(),
				},
			},
			() => undefined,
			{
				request: {
					pathParams: { id: "123" },
				},
				context: { requestId: "request-1" },
				errorHandlers: {
					onRequestValidationError({ context, issues, request, route }) {
						assert.equal(context.requestId, "request-1");
						assert.deepEqual(request.pathParams, { id: "123" });
						assert.equal(route.path, "/todos/:id");

						return {
							status: 422,
							headers: { "x-error": "validation" },
							body: {
								code: "VALIDATION_ERROR",
								issueCount: issues.length,
							},
						};
					},
				},
			},
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 422,
			headers: { "x-error": "validation" },
			body: {
				code: "VALIDATION_ERROR",
				issueCount: 1,
			},
		});
	});

	it("uses custom unhandled error responses", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos",
				responses: {
					200: z.object({ id: z.string() }),
				},
			},
			() => {
				throw new Error("boom");
			},
			{
				request: {},
				context: { requestId: "request-1" },
				errorHandlers: {
					onUnhandledError({ context, error, route }) {
						assert.equal(context.requestId, "request-1");
						assert.equal(route.path, "/todos");
						assert.ok(error instanceof Error);

						return {
							status: 500,
							body: { code: "INTERNAL_SERVER_ERROR" },
						};
					},
				},
			},
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 500,
			headers: undefined,
			body: { code: "INTERNAL_SERVER_ERROR" },
		});
	});

	it("rethrows unhandled errors when the custom handler returns undefined", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						method: "GET",
						path: "/todos",
						responses: {
							200: z.object({ id: z.string() }),
						},
					},
					() => {
						throw new Error("boom");
					},
					{
						request: {},
						context: {},
						errorHandlers: {
							onUnhandledError: () => undefined,
						},
					},
				),
			/boom/,
		);
	});

	it("requires explicit response objects when a route has multiple success statuses", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						method: "POST",
						path: "/todos",
						responses: {
							200: z.object({ id: z.string() }),
							202: z.object({ id: z.string() }),
						},
					},
					() => ({ id: "todo-1" }),
					{ request: {}, context: {} },
				),
			/must return a declared response object/,
		);
	});

	it("normalizes declared response headers", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos",
				responses: {
					200: {
						body: z.object({ id: z.string() }),
						headers: {
							etag: z.string(),
							"x-optional": z.string().optional(),
						},
					},
				},
			},
			() => ({
				status: 200 as const,
				body: { id: "todo-1" },
				responseHeaders: {
					etag: "todo-etag",
					"x-optional": undefined,
				},
				headers: {
					"cache-control": "private",
				},
			}),
			{ request: {}, context: {} },
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 200,
			headers: {
				"cache-control": "private",
				etag: "todo-etag",
			},
			body: { id: "todo-1" },
		});
	});

	it("rejects declared response header values that are not scalar", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						method: "GET",
						path: "/todos",
						responses: {
							200: {
								body: z.object({ id: z.string() }),
								headers: {
									"x-meta": z.object({ id: z.string() }),
								},
							},
						},
					},
					() => ({
						status: 200 as const,
						body: { id: "todo-1" },
						responseHeaders: {
							"x-meta": { id: "meta-1" },
						},
					}),
					{ request: {}, context: {} },
				),
			/Declared response header "x-meta" must resolve to a string or number/,
		);
	});

	it("rejects array values for declared response headers", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						method: "GET",
						path: "/todos",
						responses: {
							200: {
								body: z.object({ id: z.string() }),
								headers: {
									"x-tags": z.array(z.string()),
								},
							},
						},
					},
					() => ({
						status: 200 as const,
						body: { id: "todo-1" },
						responseHeaders: {
							"x-tags": ["alpha", "beta"],
						},
					}),
					{ request: {}, context: {} },
				),
			/Declared response header "x-tags" must resolve to a string or number/,
		);
	});

	it("rejects duplicate declared and raw response headers", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						method: "GET",
						path: "/todos",
						responses: {
							200: {
								body: z.object({ id: z.string() }),
								headers: {
									etag: z.string(),
								},
							},
						},
					},
					() => ({
						status: 200 as const,
						body: { id: "todo-1" },
						responseHeaders: {
							etag: "declared",
						},
						headers: {
							ETag: "raw",
						},
					}),
					{ request: {}, context: {} },
				),
			/Response header "etag" was returned more than once/,
		);
	});

	it("normalizes declared ContractResponseError responses", async () => {
		let called = false;
		const result = await handleHttpRoute(
			routeWithDeclaredErrorResponse,
			() => {
				throw new ContractResponseError(routeWithDeclaredErrorResponse, {
					status: 404,
					body: { code: "not_found" },
				});
			},
			{
				request: {},
				context: {},
				errorHandlers: {
					onUnhandledError: () => {
						called = true;
						return { status: 500 };
					},
				},
			},
		);

		assert.equal(called, false);
		assert.deepEqual(result, {
			kind: "json",
			status: 404,
			headers: undefined,
			body: { code: "not_found" },
		});
	});

	it("validates ContractResponseError response bodies during normalization", async () => {
		await assert.rejects(() =>
			handleHttpRoute(
				routeWithDeclaredErrorResponse,
				() => {
					throw new ContractResponseError(routeWithDeclaredErrorResponse, {
						status: 404,
						body: { code: "gone" },
					} as never);
				},
				{ request: {}, context: {} },
			),
		);
	});
});

describe("handleHttpRoute custom responses", () => {
	it("normalizes custom single bodies after validating without serializing them", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/report.csv",
				responses: {
					200: customBody({
						contentType: "text/csv",
						schema: z.string(),
					}),
				},
			},
			() => ({ status: 200, body: "id,title\n1,First\n" }),
			{ request: {}, context: {} },
		);

		assert.equal(result.kind, "custom");
		assert.equal(result.status, 200);
		assert.equal(result.contentType, "text/csv");
		assert.equal(result.body, "id,title\n1,First\n");
	});

	it("validates custom single response bodies", async () => {
		await assert.rejects(() =>
			handleHttpRoute(
				{
					method: "GET",
					path: "/report.csv",
					responses: {
						200: customBody({
							contentType: "text/csv",
							schema: z.number(),
						}),
					},
				},
				() => ({ status: 200, body: "id,title\n1,First\n" }),
				{ request: {}, context: {} },
			),
		);
	});

	it("normalizes custom response bodies with selected content types", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/images/:id",
				responses: {
					200: customBody({
						contentType: ["image/png", "image/jpeg"],
						schema: z.string(),
					}),
				},
			},
			() => ({
				status: 200,
				body: {
					contentType: "image/jpeg",
					payload: "jpeg bytes",
				},
			}),
			{ request: {}, context: {} },
		);

		assert.equal(result.kind, "custom");
		assert.equal(result.status, 200);
		assert.equal(result.contentType, "image/jpeg");
		assert.equal(result.body, "jpeg bytes");
	});

	it("rejects undeclared custom response content types", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						method: "GET",
						path: "/images/:id",
						responses: {
							200: customBody({
								contentType: ["image/png", "image/jpeg"],
								schema: z.string(),
							}),
						},
					},
					() => ({
						status: 200,
						body: {
							contentType: "image/webp",
							payload: "webp bytes",
						},
					}),
					{ request: {}, context: {} },
				),
			/Unsupported custom response body contentType/,
		);
	});

	it("normalizes custom streamed bodies after validating without framing chunks", async () => {
		async function* rows() {
			yield "id,title\n";
			yield "1,First\n";
		}

		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/report.csv",
				responses: {
					200: stream(
						customBody({
							contentType: "text/csv",
							schema: z.string(),
						}),
					),
				},
			},
			() => ({ status: 200, body: rows() }),
			{ request: {}, context: {} },
		);

		assert.equal(result.kind, "stream");
		assert.equal(result.status, 200);
		assert.equal(result.contentType, "text/csv");

		const chunks = [];
		for await (const chunk of result.body) chunks.push(chunk);

		assert.deepEqual(chunks, ["id,title\n", "1,First\n"]);
	});

	it("validates custom streamed response chunks", async () => {
		async function* rows() {
			yield "id,title\n";
		}

		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/report.csv",
				responses: {
					200: stream(
						customBody({
							contentType: "text/csv",
							schema: z.number(),
						}),
					),
				},
			},
			() => ({ status: 200, body: rows() }),
			{ request: {}, context: {} },
		);

		assert.equal(result.kind, "stream");
		await assert.rejects(async () => {
			for await (const _chunk of result.body) {
				_chunk;
			}
		});
	});
});
