import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import z from "zod";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import { sseEvent } from "./sse.ts";
import {
	RequestValidationError,
	ResponseValidationError,
} from "./validationErrors.ts";

const routeWithDeclaredErrorResponse = coreRoute
	.get("/todos/:id")
	.response(200, z.object({ id: z.string() }))
	.response(404, z.object({ code: z.literal("not_found") }));

describe("handleHttpRoute", () => {
	it("passes validated request data and context to the handler", async () => {
		const result = await handleHttpRoute(
			coreRoute
				.get("/todos/:id")
				.params(z.object({ id: z.coerce.number<number>() }))
				.response(200, z.object({ id: z.number() })),
			(request) => {
				assert.deepEqual(request, {
					params: { id: 123 },
					context: { requestId: "request-1" },
				});

				return { id: request.params.id };
			},
			{
				request: {
					params: { id: "123" },
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

	it("passes grouped request data under explicit HTTP segments", async () => {
		const result = await handleHttpRoute(
			coreRoute
				.get("/todos")
				.query(z.object({ q: z.string() }).transform(() => ["todo"]))
				.response(204),
			(request) => {
				assert.deepEqual(request, {
					query: ["todo"],
					context: {},
				});
			},
			{
				request: {
					query: new URLSearchParams({ q: "todos" }),
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

	it("throws grouped request validation errors without calling the handler", async () => {
		let called = false;
		await assert.rejects(
			() =>
				handleHttpRoute(
					coreRoute
						.get("/todos/:id")
						.params(z.object({ id: z.number() }))
						.response(204),
					() => {
						called = true;
					},
					{
						request: {
							params: { id: "123" },
						},
						context: {},
					},
				),
			(error) => {
				assert.ok(error instanceof RequestValidationError);
				assert.equal(error.issues.body.length, 0);
				assert.equal(error.issues.query.length, 0);
				assert.equal(error.issues.params.length, 1);
				assert.equal(error.issues.headers.length, 0);
				return true;
			},
		);

		assert.equal(called, false);
	});

	it("rethrows user handler errors unchanged", async () => {
		const expected = new Error("boom");
		await assert.rejects(
			() =>
				handleHttpRoute(
					coreRoute.get("/todos").response(200, z.object({ id: z.string() })),
					() => {
						throw expected;
					},
					{
						request: {},
						context: {},
					},
				),
			(error) => error === expected,
		);
	});

	it("throws response body validation errors", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					coreRoute.get("/todos").response(200, z.object({ id: z.string() })),
					() => ({ id: 123 }),
					{
						request: {},
						context: {},
					},
				),
			(error) => {
				assert.ok(error instanceof ResponseValidationError);
				assert.equal(error.location, "body");
				assert.equal(error.issues.length, 1);
				return true;
			},
		);
	});

	it("requires explicit response objects when a route has multiple success statuses", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					coreRoute
						.post("/todos")
						.response(200, z.object({ id: z.string() }))
						.response(202, z.object({ id: z.string() })),
					() => ({ id: "todo-1" }),
					{
						request: {},
						context: {},
					},
				),
			(error) =>
				error instanceof Error &&
				!(error instanceof ResponseValidationError) &&
				/declared response object/.test(error.message),
		);
	});

	it("treats returned status and body fields as an explicit response object", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					coreRoute.get("/jobs/:id").response(
						200,
						z.object({
							status: z.number(),
							body: z.string(),
						}),
					),
					() => ({ status: 123, body: "running" }),
					{
						request: {},
						context: {},
					},
				),
			(error) =>
				error instanceof Error &&
				!(error instanceof ResponseValidationError) &&
				/undeclared status 123/.test(error.message),
		);
	});

	it("normalizes declared response headers", async () => {
		const result = await handleHttpRoute(
			coreRoute.get("/todos").response(200, {
				body: z.object({ id: z.string() }),
				headers: z.object({
					etag: z.string(),
					"x-optional": z.string().optional(),
				}),
			}),
			() => ({
				status: 200 as const,
				body: { id: "todo-1" },
				responseHeaders: {
					etag: "todo-etag",
					"x-optional": undefined,
				},
			}),
			{
				request: {},
				context: {},
			},
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 200,
			headers: {
				etag: "todo-etag",
			},
			body: { id: "todo-1" },
		});
	});

	it("normalizes declared RouteResponseError responses", async () => {
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
			},
		);

		assert.deepEqual(result, {
			kind: "json",
			status: 404,
			headers: undefined,
			body: { code: "not_found" },
		});
	});

	it("validates RouteResponseError response bodies during normalization", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					routeWithDeclaredErrorResponse,
					() => {
						throw new RouteResponseError(routeWithDeclaredErrorResponse, {
							status: 404,
							body: { code: "gone" },
						} as never);
					},
					{
						request: {},
						context: {},
					},
				),
			(error) => {
				assert.ok(error instanceof ResponseValidationError);
				assert.equal(error.location, "body");
				return true;
			},
		);
	});

	it("throws an ordinary error when RouteResponseError targets an undeclared status", async () => {
		const routes = {
			todos: {
				get: routeWithDeclaredErrorResponse,
				create: coreRoute
					.post("/todos")
					.response(201, z.object({ id: z.string() }))
					.response(409, z.object({ code: z.literal("already_exists") })),
			},
		};

		await assert.rejects(
			() =>
				handleHttpRoute(
					routes.todos.get,
					() => {
						throw new RouteResponseError(routes.todos, {
							status: 409,
							body: { code: "already_exists" },
						});
					},
					{
						request: {},
						context: {},
					},
				),
			(error) =>
				error instanceof Error &&
				!(error instanceof ResponseValidationError) &&
				/undeclared status 409/.test(error.message),
		);
	});
});

describe("handleHttpRoute custom responses", () => {
	it("normalizes custom single bodies after validating without serializing them", async () => {
		const result = await handleHttpRoute(
			coreRoute.get("/report.csv").customResponse(200, {
				contentType: "text/csv",
				schema: z.string(),
			}),
			() => ({ status: 200, body: "id,title\n1,First\n" }),
			{
				request: {},
				context: {},
			},
		);

		assert.equal(result.kind, "custom");
		assert.equal(result.status, 200);
		assert.equal(result.contentType, "text/csv");
		assert.equal(result.body, "id,title\n1,First\n");
	});

	it("normalizes custom response bodies with selected content types", async () => {
		const result = await handleHttpRoute(
			coreRoute.get("/images/:id").customResponse(200, {
				contentType: ["image/png", "image/jpeg"],
				schema: z.string(),
			}),
			() => ({
				status: 200,
				body: {
					contentType: "image/jpeg",
					payload: "jpeg bytes",
				},
			}),
			{
				request: {},
				context: {},
			},
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
			coreRoute.get("/report.csv").customStreamResponse(200, {
				contentType: "text/csv",
				schema: z.string(),
			}),
			() => ({ status: 200, body: rows() }),
			{
				request: {},
				context: {},
			},
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
			coreRoute.sse("/events").response(z.object({ id: z.coerce.string() })),
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
