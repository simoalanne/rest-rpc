import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StandardSchemaV1 } from "@contract-first-api/core";
import {
	router as defineRouter,
	noBody,
	streamBody,
} from "@contract-first-api/core/contract";
import { Hono } from "hono";
import { registerRoutes, router } from "./index.ts";

const schema = <T>(
	validate: (value: unknown) => value is T = (_value): _value is T => true,
): StandardSchemaV1<T, T> => ({
	"~standard": {
		version: 1,
		vendor: "contract-first-api-hono-test",
		validate: (value) =>
			validate(value)
				? { value }
				: { issues: [{ message: "Invalid test schema value" }] },
	},
});

const objectSchema = <T extends Record<string, unknown>>(): StandardSchemaV1<
	T,
	T
> =>
	schema<T>((value): value is T => typeof value === "object" && value !== null);

const includeDoneQuerySchema = schema<{ includeDone: "true" | "false" }>(
	(value): value is { includeDone: "true" | "false" } =>
		typeof value === "object" &&
		value !== null &&
		"includeDone" in value &&
		(value.includeDone === "true" || value.includeDone === "false"),
);

const api = defineRouter({
	todos: {
		get: {
			method: "GET",
			path: "/todos/:id",
			request: {
				params: objectSchema<{ id: string }>(),
				query: includeDoneQuerySchema,
				requestKeys: {
					id: "params",
					includeDone: "query",
				},
			},
			responses: {
				200: objectSchema<{ id: string; includeDone: boolean }>(),
			},
		},
		create: {
			method: "POST",
			path: "/todos",
			request: {
				body: objectSchema<{ title: string }>(),
				requestKeys: {
					title: "body",
				},
			},
			responses: {
				201: objectSchema<{ id: string; title: string }>(),
			},
		},
		remove: {
			method: "DELETE",
			path: "/todos/:id",
			request: {
				params: objectSchema<{ id: string }>(),
				requestKeys: {
					id: "params",
				},
			},
			responses: {
				204: noBody(),
			},
		},
		stream: {
			method: "GET",
			path: "/todos/:id/events",
			request: {
				params: objectSchema<{ id: string }>(),
				requestKeys: {
					id: "params",
				},
			},
			responses: {
				200: streamBody(objectSchema<{ id: string; event: string }>()),
			},
		},
	},
});

const createApp = () => {
	const app = new Hono();

	registerRoutes(
		app,
		router(api, {
			todos: {
				get: ({ id, includeDone, context }) => {
					assert.equal(context.c.req.path, `/todos/${id}`);
					return {
						id,
						includeDone: includeDone === "true",
					};
				},
				create: ({ title }) => ({
					status: 201,
					body: {
						id: "todo-1",
						title,
					},
				}),
				remove: () => ({
					status: 204,
					body: undefined,
				}),
				stream: async function* ({ id }) {
					yield { id, event: "created" };
					yield { id, event: "updated" };
				},
			},
		}),
	);

	return app;
};

describe("registerRoutes", () => {
	it("registers contract routes on a Hono app", async () => {
		const app = createApp();
		const response = await app.request("/todos/todo-1?includeDone=true");

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			id: "todo-1",
			includeDone: true,
		});
	});

	it("parses JSON request bodies", async () => {
		const app = createApp();
		const response = await app.request("/todos", {
			method: "POST",
			body: JSON.stringify({ title: "Write Hono adapter" }),
			headers: { "content-type": "application/json" },
		});

		assert.equal(response.status, 201);
		assert.deepEqual(await response.json(), {
			id: "todo-1",
			title: "Write Hono adapter",
		});
	});

	it("returns request validation errors", async () => {
		const app = createApp();
		const response = await app.request("/todos/todo-1?includeDone=maybe");

		assert.equal(response.status, 400);
		assert.match(await response.text(), /Request validation failed/);
	});

	it("returns empty responses", async () => {
		const app = createApp();
		const response = await app.request("/todos/todo-1", {
			method: "DELETE",
		});

		assert.equal(response.status, 204);
		assert.equal(await response.text(), "");
	});

	it("returns NDJSON streams", async () => {
		const app = createApp();
		const response = await app.request("/todos/todo-1/events");

		assert.equal(response.status, 200);
		assert.equal(response.headers.get("content-type"), "application/x-ndjson");
		assert.equal(
			await response.text(),
			'{"id":"todo-1","event":"created"}\n{"id":"todo-1","event":"updated"}\n',
		);
	});
});
