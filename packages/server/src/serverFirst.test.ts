import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { route as coreRoute } from "@rest-rpc/core";
import { type } from "@rest-rpc/core/standard-schema";
import { z } from "zod";
import { handleHttpRoute } from "./handleHttpRoute.ts";
import type {
	RuntimeRouteHandler,
	ServerHttpRouteDeclaration,
} from "./router.ts";
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
		implementation.route as ServerHttpRouteDeclaration,
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
	it("extends core builders and attaches handlers without replacing the route", async () => {
		const signal = new AbortController().signal;
		const builder = serverFirstRoute
			.with({ pathPrefix: "/v1", metadata: { feature: "todos" } })
			.post("/todos")
			.body(type<{ title: string }>());
		const implementation = builder.handler(({ title, context }) => ({
			status: 201,
			body: { title, requestId: context.requestId, signal: context.signal },
		}));

		assert.equal(implementation.route, builder);
		assert.equal(implementation.route.path, "/v1/todos");
		assert.deepEqual(implementation.route.metadata, { feature: "todos" });

		const result = await handleHttpRoute(
			implementation.route as ServerHttpRouteDeclaration,
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

	it("normalizes server-first SSE routes with SSE response metadata", async () => {
		const signal = new AbortController().signal;
		const implementation = serverFirstRoute
			.sse("/events")
			.response(type<string>())
			.handler(async function* ({ context }) {
				assert.equal(context.signal, signal);
				yield { data: "updated" };
			});

		const result = await execute(implementation, { signal });
		assert.equal(result.kind, "stream");
		assert.equal(await responseKind(result), "v=1 kind=sse");
	});
});
