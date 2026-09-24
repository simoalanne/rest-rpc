import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import z from "zod";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import {
	RequestValidationError,
	ResponseValidationError,
} from "./validationErrors.ts";

describe("handleHttpRoute", () => {
	it("passes validated request data, handler fields, context, and route", async () => {
		const route = coreRoute
			.get("/todos/:id")
			.params(z.object({ id: z.coerce.number<number>() }))
			.response(200, z.object({ id: z.number() }))["~restrpc"];
		const result = await handleHttpRoute(
			{
				route: route,
				handler: (request) => {
					assert.deepEqual(request, {
						body: undefined,
						query: undefined,
						headers: undefined,
						params: { id: 123 },
						frameworkValue: "framework-1",
						context: { requestId: "request-1" },
						route,
					});

					return { status: 200, body: { id: request.params.id } };
				},
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
			kind: "response",
			status: 200,
			headers: undefined,
			body: { value: { id: 123 }, contentType: "application/json" },
		});
	});

	it("passes grouped request data under explicit HTTP segments", async () => {
		const route = coreRoute
			.get("/todos")
			.query(z.object({ q: z.string() }).transform(() => ["todo"]))
			.response(204)["~restrpc"];
		const result = await handleHttpRoute(
			{
				route: route,
				handler: (request) => {
					assert.deepEqual(request, {
						body: undefined,
						params: undefined,
						headers: undefined,
						query: ["todo"],
						context: {},
						route,
					});
					return { status: 204 };
				},
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
			kind: "response",
			status: 204,
			headers: undefined,
		});
	});

	it("returns grouped request validation errors without calling the handler", async () => {
		let called = false;
		const error = await handleHttpRoute(
			{
				route: coreRoute
					.get("/todos/:id")
					.params(z.object({ id: z.number() }))
					.response(204)["~restrpc"],
				handler: () => {
					called = true;
				},
			},
			{
				request: {
					params: { id: "123" },
				},
				handlerFields: {},
				context: {},
			},
		);
		assert.ok(error instanceof RequestValidationError);
		assert.equal(error.status, 400);
		assert.deepEqual(error.responseBody, {
			message:
				"Request validation failed. Check the validationErrors field for details.",
			validationErrors: error.issues,
		});
		assert.equal(error.issues.body.length, 0);
		assert.equal(error.issues.query.length, 0);
		assert.equal(error.issues.params.length, 1);
		assert.equal(error.issues.headers.length, 0);

		assert.equal(called, false);
	});

	it("normalizes inferred procedure results as successful JSON", async () => {
		const route = {
			kind: "procedure" as const,
			method: "POST" as const,
			path: "/todos/get",
			responses: {},
		};
		const result = await handleHttpRoute(
			{ route: route, handler: () => ({ id: "todo-1" }) },
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);

		assert.deepEqual(result, {
			kind: "response",
			status: 200,
			body: { value: { id: "todo-1" }, contentType: "application/json" },
		});
		const enveloped = await handleHttpRoute(
			{
				route: route,
				handler: () => ({ status: 201, body: { id: "todo-1" } }),
			},
			{ request: {}, handlerFields: {}, context: {} },
		);
		assert.deepEqual(enveloped, {
			kind: "response",
			status: 201,
			body: { value: { id: "todo-1" }, contentType: "application/json" },
			headers: undefined,
		});
		await assert.rejects(
			handleHttpRoute(
				{ route: route, handler: () => ({ status: "bad" }) },
				{
					request: {},
					handlerFields: {},
					context: {},
				},
			),
			/Invalid inferred HTTP response status "bad"/,
		);
	});

	it("normalizes declared procedure outputs directly", async () => {
		const route = coreRoute
			.get("/ready")
			.input(z.object({ term: z.string() }))
			.output(z.object({ status: z.literal("ready") }))["~restrpc"];
		let input: unknown;
		const result = await handleHttpRoute(
			{
				route: route,
				handler: (request: { input: unknown }) => {
					input = request.input;
					return { status: "ready" };
				},
			},
			{
				request: { query: new URLSearchParams({ term: "go" }) },
				handlerFields: {},
				context: {},
			},
		);
		assert.deepEqual(input, { term: "go" });

		assert.deepEqual(result, {
			kind: "response",
			status: 200,
			headers: undefined,
			body: { value: { status: "ready" }, contentType: "application/json" },
		});
	});

	it("normalizes declared custom procedure output wrappers", async () => {
		const route = coreRoute.output(z.string(), { contentType: "text/plain" })[
			"~restrpc"
		];
		const result = await handleHttpRoute(
			{
				route: route,
				handler: () => ({ contentType: "text/plain", data: "todo data" }),
			},
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);

		assert.deepEqual(result, {
			kind: "response",
			status: 200,
			headers: undefined,
			body: { value: "todo data", contentType: "text/plain" },
		});
	});

	it("requires declared custom procedure output wrappers", async () => {
		const route = coreRoute.output(z.string(), { contentType: "text/plain" })[
			"~restrpc"
		];

		await assert.rejects(
			() =>
				handleHttpRoute(
					{ route: route, handler: () => "todo data" },
					{
						request: {},
						handlerFields: {},
						context: {},
					},
				),
			/Custom procedure output must return/,
		);
	});

	it("normalizes declared procedure streams directly", async () => {
		const route = coreRoute.streamOutput(z.object({ id: z.string() }))[
			"~restrpc"
		];
		const result = await handleHttpRoute(
			{
				route: route,
				handler: () =>
					(async function* () {
						yield { id: "event-1" };
					})(),
			},
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);

		assert.equal(result.kind, "stream");
		if (result.kind !== "stream") throw new Error("Expected stream");
		const events = [];
		for await (const event of result.body) events.push(event);
		assert.deepEqual(events, [{ id: "event-1" }]);
	});

	it("classifies inferred custom and stream procedure outputs", async () => {
		const route = {
			kind: "procedure" as const,
			method: "POST" as const,
			path: "/events",
			responses: {},
		};
		const custom = await handleHttpRoute(
			{
				route: route,
				handler: () => ({ contentType: "text/plain", data: "event data" }),
			},
			{ request: {}, handlerFields: {}, context: {} },
		);
		const stream = await handleHttpRoute(
			{
				route: route,
				handler: () =>
					(async function* () {
						yield { id: "event-1" };
					})(),
			},
			{ request: {}, handlerFields: {}, context: {} },
		);

		assert.deepEqual(custom, {
			kind: "response",
			status: 200,
			body: { value: "event data", contentType: "text/plain" },
		});
		assert.equal(stream.kind, "stream");
	});

	it("passes acquired procedure input through schema validation", async () => {
		const declaration = coreRoute
			.input(z.object({ title: z.string() }), {
				contentType: "application/x-www-form-urlencoded",
			})
			.output(z.object({ title: z.string() }))["~restrpc"];
		const result = await handleHttpRoute(
			{
				route: declaration,
				handler: (request) => {
					assert.deepEqual(request, {
						input: { title: "Write docs" },
						context: {},
						route: declaration,
					});
					return { title: "Write docs" };
				},
			},
			{
				request: {
					body: { title: "Write docs" },
					headers: {
						"content-type": "application/x-www-form-urlencoded",
					},
				},
				handlerFields: {},
				context: {},
			},
		);

		assert.equal(result.status, 200);
	});

	it("rethrows user handler errors unchanged", async () => {
		const expected = new Error("boom");
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						route: coreRoute
							.get("/todos")
							.response(200, z.object({ id: z.string() }))["~restrpc"],
						handler: () => {
							throw expected;
						},
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

	it("returns response body validation errors", async () => {
		const error = await handleHttpRoute(
			{
				route: coreRoute
					.get("/todos")
					.response(200, z.object({ id: z.string() }))["~restrpc"],
				handler: () => ({ status: 200, body: { id: 123 } }),
			},
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);
		assert.ok(error instanceof ResponseValidationError);
		assert.equal(error.status, 500);
		assert.deepEqual(error.responseBody, {
			message: "Response validation failed.",
		});
		assert.equal(error.location, "body");
		assert.equal(error.issues.length, 1);
	});

	it("treats returned status and body fields as an explicit response object", async () => {
		await assert.rejects(
			() =>
				handleHttpRoute(
					{
						route: coreRoute.get("/jobs/:id").response(
							200,
							z.object({
								status: z.number(),
								body: z.string(),
							}),
						)["~restrpc"],
						handler: () => ({ status: 123, body: "running" }),
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
				/undeclared status 123/.test(error.message),
		);
	});

	it("normalizes declared response headers", async () => {
		const result = await handleHttpRoute(
			{
				route: coreRoute
					.get("/todos")
					.response(200, z.object({ id: z.string() }), {
						headers: z.object({
							etag: z.string(),
							"x-optional": z.string().optional(),
						}),
					})["~restrpc"],
				handler: () => ({
					status: 200 as const,
					body: { id: "todo-1" },
					responseHeaders: {
						etag: "todo-etag",
						"x-optional": undefined,
					},
				}),
			},
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);

		assert.deepEqual(result, {
			kind: "response",
			status: 200,
			headers: {
				etag: "todo-etag",
			},
			body: { value: { id: "todo-1" }, contentType: "application/json" },
		});
	});
});

describe("handleHttpRoute custom responses", () => {
	it("normalizes custom single bodies after validating without serializing them", async () => {
		const result = await handleHttpRoute(
			{
				route: coreRoute
					.get("/report.csv")
					.response(200, z.string(), { contentType: "text/csv" })["~restrpc"],
				handler: () => ({ status: 200, body: "id,title\n1,First\n" }),
			},
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);

		assert.equal(result.kind, "response");
		if (result.kind !== "response") throw new Error("Expected response");
		assert.equal(result.status, 200);
		assert.equal(result.body?.contentType, "text/csv");
		assert.equal(result.body?.value, "id,title\n1,First\n");
	});

	it("normalizes custom response bodies with selected content types", async () => {
		const result = await handleHttpRoute(
			{
				route: coreRoute.get("/images/:id").response(200, z.string(), {
					contentType: ["image/png", "image/jpeg"],
				})["~restrpc"],
				handler: () => ({
					status: 200,
					body: "jpeg bytes",
					contentType: "image/jpeg",
				}),
			},
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);

		assert.equal(result.kind, "response");
		if (result.kind !== "response") throw new Error("Expected response");
		assert.equal(result.status, 200);
		assert.equal(result.body?.contentType, "image/jpeg");
		assert.equal(result.body?.value, "jpeg bytes");
	});

	it("treats an ordinary NDJSON content type as custom content", async () => {
		const result = await handleHttpRoute(
			{
				route: coreRoute.get("/events").response(200, z.string(), {
					contentType: "application/x-ndjson",
				})["~restrpc"],
				handler: () => ({ status: 200, body: "event data" }),
			},
			{
				request: {},
				handlerFields: {},
				context: {},
			},
		);

		assert.equal(result.kind, "response");
		if (result.kind !== "response") throw new Error("Expected response");
		assert.equal(result.body?.contentType, "application/x-ndjson");
		assert.equal(result.body?.value, "event data");
	});
});
