import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { type } from "@rest-rpc/core/standard-schema";
import { z } from "zod";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import { createRouteMatcher } from "./match.ts";
import type { RuntimeRouteHandler } from "./router.ts";
import { implement, serverFirstRoute } from "./serverFirst.ts";
import { SERVER_FIRST_RESPONSE_KIND_HEADER } from "@rest-rpc/core/client";
import type { HttpRouteResult } from "../src/handleHttpRoute.ts";
import { handleHttpRouteResult } from "../src/handleHttpRouteResult.ts";
import { ResponseValidationError } from "./validationErrors.ts";

const execute = (
	implementation: {
		route: unknown;
		handler: RuntimeRouteHandler;
	},
	context: Record<string, unknown> = {
		requestId: "request-1",
		signal: new AbortController().signal,
	},
) =>
	handleHttpRoute(
		implementation.route as RouteDeclaration,
		implementation.handler,
		{
			request: {},
			context,
		},
	);

const responseKind = async (result: HttpRouteResult) => {
	let responseKind: string | null = null;
	await handleHttpRouteResult(result, {
		setHeader: (name, value) => {
			if (name === SERVER_FIRST_RESPONSE_KIND_HEADER) {
				responseKind = value === undefined ? null : String(value);
			}
		},
		sendEmpty: () => undefined,
		sendJson: () => undefined,
		sendCustom: () => undefined,
		sendStream: () => undefined,
	});
	return responseKind;
};

describe("server-first runtime", () => {
	it("builds and lowers every shorthand handler order", async () => {
		const input = z.object({
			title: z.string().transform((title) => title.trim()),
		});
		const output = z.object({ title: z.string() }).transform(({ title }) => ({
			title: title.toUpperCase(),
		}));
		const implementations = {
			todos: {
				inferred: serverFirstRoute.handler(({ context }) => ({
					title: String(context.requestId),
				})),
				input: serverFirstRoute.input(input).handler(({ input }) => ({
					title: input.title,
				})),
				output: serverFirstRoute.output(output).handler(() => ({
					title: "todo",
				})),
				inputOutput: serverFirstRoute
					.input(input)
					.output(output)
					.handler(({ input }) => ({
						title: input.title,
					})),
				outputInput: serverFirstRoute
					.output(output)
					.input(input)
					.handler(({ input }) => ({
						title: input.title,
					})),
				primitiveInput: serverFirstRoute
					.input(z.string().transform((value) => value.trim()))
					.handler(({ input }) => ({ value: input })),
				contextInput: serverFirstRoute
					.input(z.object({ context: z.string() }))
					.handler(({ input, context }) => ({
						inputContext: input.context,
						requestId: context.requestId,
					})),
			},
		};
		const matchRoute = createRouteMatcher(implementations);
		const implementationAt = (path: string) =>
			matchRoute({ method: "POST", path })?.implementation;

		const inferredImplementation = implementationAt("/todos/inferred")!;
		const inferred = await handleHttpRoute(
			inferredImplementation.route,
			inferredImplementation.handler,
			{
				request: {},
				context: {
					requestId: "request-1",
					signal: new AbortController().signal,
				},
			},
		);
		assert.equal(inferred.status, 200);
		assert.deepEqual("body" in inferred ? inferred.body : undefined, {
			title: "request-1",
		});
		const outputImplementation = implementationAt("/todos/output")!;
		const outputResult = await handleHttpRoute(
			outputImplementation.route,
			outputImplementation.handler,
			{
				request: {},
				context: { signal: new AbortController().signal },
			},
		);
		assert.deepEqual("body" in outputResult ? outputResult.body : undefined, {
			title: "TODO",
		});

		const inputImplementation = implementationAt("/todos/input")!;
		const inputResult = await handleHttpRoute(
			inputImplementation.route,
			inputImplementation.handler,
			{
				request: { body: { title: " todo " } },
				context: { signal: new AbortController().signal },
			},
		);
		assert.deepEqual("body" in inputResult ? inputResult.body : undefined, {
			title: "todo",
		});

		for (const implementation of [
			implementationAt("/todos/inputOutput")!,
			implementationAt("/todos/outputInput")!,
		]) {
			const result = await handleHttpRoute(
				implementation.route,
				implementation.handler,
				{
					request: { body: { title: " todo " } },
					context: { signal: new AbortController().signal },
				},
			);
			assert.equal(result.status, 200);
			assert.deepEqual("body" in result ? result.body : undefined, {
				title: "TODO",
			});
		}

		const primitiveImplementation = implementationAt("/todos/primitiveInput")!;
		const primitiveResult = await handleHttpRoute(
			primitiveImplementation.route,
			primitiveImplementation.handler,
			{
				request: { body: " value " },
				context: { signal: new AbortController().signal },
			},
		);
		assert.deepEqual(
			"body" in primitiveResult ? primitiveResult.body : undefined,
			{ value: "value" },
		);

		const contextImplementation = implementationAt("/todos/contextInput")!;
		const contextResult = await handleHttpRoute(
			contextImplementation.route,
			contextImplementation.handler,
			{
				request: { body: { context: "input-context" } },
				context: {
					requestId: "request-context",
					signal: new AbortController().signal,
				},
			},
		);
		assert.deepEqual("body" in contextResult ? contextResult.body : undefined, {
			inputContext: "input-context",
			requestId: "request-context",
		});
	});

	it("implements shorthand contracts while retaining their tree-derived path", () => {
		const contract = {
			todos: {
				add: coreRoute
					.input(z.object({ title: z.string() }))
					.output(z.object({ title: z.string() })),
			},
		};
		const implementation = implement(contract).todos.add.handler(
			({ input }) => ({
				title: input.title,
			}),
		);
		const resolved = createRouteMatcher({ todos: { add: implementation } })({
			method: "POST",
			path: "/todos/add",
		})?.implementation;

		assert.equal(implementation.route, contract.todos.add);
		assert.equal(resolved?.route.method, "POST");
		assert.equal(resolved?.route.path, "/todos/add");
	});

	it("extends core builders and attaches handlers without replacing the route", async () => {
		const signal = new AbortController().signal;
		const builder = serverFirstRoute
			.with({ pathPrefix: "/v1", metadata: { feature: "todos" } })
			.post("/todos")
			.body(type<{ title: string }>());
		const implementation = builder.handler(({ context, body: { title } }) => ({
			status: 201,
			body: { title, requestId: context.requestId, signal: context.signal },
		}));

		assert.equal(implementation.route, builder);
		assert.equal(implementation.route.path, "/v1/todos");
		assert.deepEqual(implementation.route.metadata, { feature: "todos" });

		const result = await handleHttpRoute(
			implementation.route as RouteDeclaration,
			implementation.handler,
			{
				request: { body: { title: "Write tests" } },
				context: { requestId: "request-1", signal },
			},
		);

		assert.equal(result.kind, "json");
		assert.deepEqual("body" in result ? result.body : undefined, {
			title: "Write tests",
			requestId: "request-1",
			signal,
		});
		assert.equal(await responseKind(result), "v=1 kind=json");
	});

	it("traverses contract trees and uses the same attachment behavior", async () => {
		const contract = {
			todos: {
				get: coreRoute.get("/todos").response(200, type<string>()),
				remove: coreRoute.delete("/todos/:id").response(204),
			},
		};
		const builders = implement(contract);
		const get = builders.todos.get.handler(() => ({
			status: 200,
			body: "todo-1",
		}));
		const remove = builders.todos.remove.handler(() => ({ status: 204 }));

		assert.equal(get.route, contract.todos.get);
		assert.equal(remove.route, contract.todos.remove);
		assert.equal(await responseKind(await execute(get)), "v=1 kind=json");
		assert.equal(await responseKind(await execute(remove)), "v=1 kind=empty");
	});

	it("normalizes every inferred HTTP response shape", async () => {
		async function* values() {
			yield { id: "todo-1" };
		}

		const cases = [
			["empty", () => ({ status: 204 })],
			["json", () => ({ status: 200, body: { id: "todo-1" } })],
			["ndjson", () => ({ status: 200, body: values() })],
			[
				"custom",
				() => ({ status: 200, contentType: "text/csv", body: "id\n1\n" }),
			],
			[
				"custom-stream",
				() => ({ status: 200, contentType: "text/plain", body: values() }),
			],
		] as const;

		for (const [kind, handler] of cases) {
			const implementation = serverFirstRoute.get(`/${kind}`).handler(handler);
			const result = await execute(implementation);
			assert.equal(await responseKind(result), `v=1 kind=${kind}`);
		}
	});

	it("keeps declared response validation authoritative", async () => {
		const implementation = serverFirstRoute
			.get("/declared")
			.response(200, z.string())
			.handler(() => ({ status: 200, body: 123 as never }));

		await assert.rejects(
			() => execute(implementation),
			(error) => {
				assert.ok(error instanceof ResponseValidationError);
				assert.equal(error.location, "body");
				return true;
			},
		);
	});

	it("preserves inferred response headers", async () => {
		const implementation = serverFirstRoute.get("/headers").handler(() => ({
			status: 200,
			body: "ok",
			responseHeaders: { etag: "todo-1", "x-page": 1 },
		}));

		const result = await execute(implementation);
		assert.deepEqual(result.headers, { etag: "todo-1", "x-page": 1 });
	});
});
