import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import z from "zod";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import { RouteResponseError } from "./routeResponseError.ts";
import {
	RequestValidationError,
	ResponseValidationError,
} from "./validationErrors.ts";

const routeWithDeclaredErrorResponse = coreRoute
	.get("/todos/:id")
	.response(200, z.object({ id: z.string() }))
	.response(404, z.object({ code: z.literal("not_found") }))["~restrpc"];

describe("handleHttpRoute", () => {
	it("passes validated request data, handler fields, context, and route", async () => {
		const route = coreRoute
			.get("/todos/:id")
			.params(z.object({ id: z.coerce.number<number>() }))
			.response(200, z.object({ id: z.number() }))["~restrpc"];
		const result = await handleHttpRoute(
			route,
			(request) => {
				assert.deepEqual(request, {
					params: { id: 123 },
					frameworkValue: "framework-1",
					context: { requestId: "request-1" },
					route,
				});

				return { status: 200, body: { id: request.params.id } };
			},
			{
				request: {
					params: { id: "123" },
				},
				handlerFields: { frameworkValue: "framework-1" },
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
		const route = coreRoute
			.get("/todos")
			.query(z.object({ q: z.string() }).transform(() => ["todo"]))
			.response(204)["~restrpc"];
		const result = await handleHttpRoute(
			route,
			(request) => {
				assert.deepEqual(request, {
					query: ["todo"],
					context: {},
					route,
				});
				return { status: 204 };
			},
			{
				request: {
					query: new URLSearchParams({ q: "todos" }),
				},
				handlerFields: {},
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
						.response(204)["~restrpc"],
					() => {
						called = true;
					},
					{
						request: {
							params: { id: "123" },
						},
						handlerFields: {},
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

	it("normalizes inferred procedure results as successful JSON", async () => {
		const route = {
			kind: "procedure" as const,
			method: "POST" as const,
			path: "/todos/get",
			responses: {},
		};
		const result = await handleHttpRoute(route, () => ({ id: "todo-1" }), {
			request: {},
			handlerFields: {},
			context: {},
		});

		assert.deepEqual(result, {
			kind: "json",
			status: 200,
			body: { id: "todo-1" },
		});
	});

	it("normalizes declared procedure outputs directly", async () => {
		const route = coreRoute.output(z.object({ status: z.literal("ready") }))[
			"~restrpc"
		];
		const result = await handleHttpRoute(route, () => ({ status: "ready" }), {
			request: {},
			handlerFields: {},
			context: {},
		});

		assert.deepEqual(result, {
			kind: "json",
			status: 200,
			headers: undefined,
			body: { status: "ready" },
		});
	});

	it("rethrows user handler errors unchanged", async () => {
		const expected = new Error("boom");
		await assert.rejects(
			() =>
				handleHttpRoute(
					coreRoute.get("/todos").response(200, z.object({ id: z.string() }))[
						"~restrpc"
					],
					() => {
						throw expected;
					},
					{
						request: {},
						handlerFields: {},
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
					coreRoute.get("/todos").response(200, z.object({ id: z.string() }))[
						"~restrpc"
					],
					() => ({ status: 200, body: { id: 123 } }),
					{
						request: {},
						handlerFields: {},
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
					)["~restrpc"],
					() => ({ status: 123, body: "running" }),
					{
						request: {},
						handlerFields: {},
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
			})["~restrpc"],
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
				handlerFields: {},
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
				handlerFields: {},
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
						handlerFields: {},
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
					.response(409, z.object({ code: z.literal("already_exists") }))[
					"~restrpc"
				],
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
						handlerFields: {},
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
			})["~restrpc"],
			() => ({ status: 200, body: "id,title\n1,First\n" }),
			{
				request: {},
				handlerFields: {},
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
			})["~restrpc"],
			() => ({
				status: 200,
				body: {
					contentType: "image/jpeg",
					payload: "jpeg bytes",
				},
			}),
			{
				request: {},
				handlerFields: {},
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
			})["~restrpc"],
			() => ({ status: 200, body: rows() }),
			{
				request: {},
				handlerFields: {},
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
