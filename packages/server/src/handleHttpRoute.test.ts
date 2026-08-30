import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	customBody,
	type HttpRouteDeclaration,
	noBody,
	stream,
} from "@rest-rpc/core/contract";
import z from "zod";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import { sseEvent } from "./sse.ts";

const routeWithDeclaredErrorResponse = {
	method: "GET",
	path: "/todos/:id",
	responses: {
		200: z.object({ id: z.string() }),
		404: z.object({ code: z.literal("not_found") }),
	},
} as const;

const normalizedSseRoute = (response: z.ZodType): HttpRouteDeclaration =>
	({
		method: "GET",
		path: "/events",
		mode: "sse",
		responses: {
			200: response,
		},
	}) as unknown as HttpRouteDeclaration;

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

	it("passes grouped request data when flattened request keys are disabled", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos",
				flattenRequestKeys: false,
				query: z.object({ q: z.string() }),
				responses: {
					204: noBody(),
				},
			},
			(request) => {
				assert.deepEqual(request, {
					query: { q: "todos" },
					context: {},
				});
			},
			{
				request: {
					query: { q: "todos" },
				},
				context: {},
			},
		);

		assert.deepEqual(result, {
			kind: "empty",
			status: 204,
			headers: undefined,
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

	it("uses custom response validation error responses", async () => {
		let unhandledCalled = false;
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos",
				responses: {
					200: z.object({ id: z.string() }),
				},
			},
			() => ({ id: 123 }),
			{
				request: {},
				context: { requestId: "request-1" },
				errorHandlers: {
					onResponseValidationError({ context, error, route }) {
						assert.equal(context.requestId, "request-1");
						assert.equal(route.path, "/todos");
						assert.ok(error);

						return {
							status: 502,
							headers: { "x-error": "response-validation" },
							body: { code: "INVALID_RESPONSE" },
						};
					},
					onUnhandledError: () => {
						unhandledCalled = true;
						return { status: 500 };
					},
				},
			},
		);

		assert.equal(unhandledCalled, false);
		assert.deepEqual(result, {
			kind: "json",
			status: 502,
			headers: { "x-error": "response-validation" },
			body: { code: "INVALID_RESPONSE" },
		});
	});

	it("uses default response validation error responses", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/todos",
				responses: {
					200: z.object({ id: z.string() }),
				},
			},
			() => ({ id: 123 }),
			{ request: {}, context: {} },
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 500,
			headers: undefined,
			body: {
				message: "Response validation failed.",
			},
		});
	});

	it("requires explicit response objects when a route has multiple success statuses", async () => {
		const result = await handleHttpRoute(
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
		);

		assert.equal(result.status, 500);
		assert.deepEqual(result.kind === "json" ? result.body : undefined, {
			message: "Response validation failed.",
		});
	});

	it("treats returned status and body fields as an explicit response object", async () => {
		const result = await handleHttpRoute(
			{
				method: "GET",
				path: "/jobs/:id",
				responses: {
					200: z.object({
						status: z.number(),
						body: z.string(),
					}),
				},
			},
			() => ({ status: 123, body: "running" }),
			{ request: {}, context: {} },
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 500,
			headers: undefined,
			body: {
				message: "Response validation failed.",
			},
		});
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

	it("rejects duplicate declared and raw response headers", async () => {
		const result = await handleHttpRoute(
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
		);

		assert.equal(result.status, 500);
	});

	it("normalizes declared RouteResponseError responses", async () => {
		let called = false;
		const result = await handleHttpRoute(
			routeWithDeclaredErrorResponse,
			() => {
				throw new RouteResponseError(routeWithDeclaredErrorResponse, {
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

	it("validates RouteResponseError response bodies during normalization", async () => {
		const result = await handleHttpRoute(
			routeWithDeclaredErrorResponse,
			() => {
				throw new RouteResponseError(routeWithDeclaredErrorResponse, {
					status: 404,
					body: { code: "gone" },
				} as never);
			},
			{ request: {}, context: {} },
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 500,
			headers: undefined,
			body: {
				message: "Response validation failed.",
			},
		});
	});

	it("returns 500 error when RouteResponseError is used to return response not declared for the handled route", async () => {
		const routes = {
			todos: {
				get: routeWithDeclaredErrorResponse,
				create: {
					method: "POST",
					path: "/todos",
					responses: {
						201: z.object({ id: z.string() }),
						409: z.object({ code: z.literal("already_exists") }),
					},
				},
			},
		} as const;

		const result = await handleHttpRoute(
			routes.todos.get,
			() => {
				throw new RouteResponseError(routes.todos, {
					status: 409,
					body: { code: "already_exists" },
				});
			},
			{ request: {}, context: {} },
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 500,
			headers: undefined,
			body: {
				message: "Response validation failed.",
			},
		});
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
});

describe("handleHttpRoute SSE responses", () => {
	it("normalizes SSE responses and exposes lastEventId in context", async () => {
		const signal = new AbortController().signal;
		const result = await handleHttpRoute(
			normalizedSseRoute(z.object({ id: z.coerce.string() })),
			async function* (request) {
				assert.equal(request.context.requestId, "request-1");
				assert.equal(request.context.signal, signal);
				assert.equal(request.context.lastEventId, "event-1");

				yield sseEvent({ id: 123 }, { id: "event-2", retry: 5_000 });
			},
			{
				request: {
					headers: {
						"Last-Event-ID": "event-1",
					},
				},
				context: { requestId: "request-1", signal },
			},
		);

		assert.equal(result.kind, "stream");
		assert.equal(result.status, 200);
		assert.equal(result.contentType, "text/event-stream");
		assert.equal(result.mode, "sse");
		assert.deepEqual(result.headers, {
			"cache-control": "no-cache",
			"x-accel-buffering": "no",
		});

		const events = [];
		for await (const event of result.body) events.push(event);

		assert.deepEqual(events, [
			sseEvent({ id: "123" }, { id: "event-2", retry: 5_000 }),
		]);
	});
});
