import assert from "node:assert/strict";
import { describe, it } from "node:test";
import z from "zod";
import { isNoBody, noBody } from "./body.ts";
import type { HttpRouteDeclaration, RouteMetadata } from "./contract.ts";
import { route, router } from "./contract.ts";

type RouteOverrides = Partial<HttpRouteDeclaration> & {
	metadata?: RouteMetadata;
};

const testContract = (
	routeOverrides: RouteOverrides = {},
): {
	search: {
		find: HttpRouteDeclaration;
	};
} => ({
	search: {
		find: {
			method: "GET",
			path: "/search",
			responses: {
				204: noBody(),
			},
			...routeOverrides,
		},
	},
});

describe("router", () => {
	it("normalizes and validates contracts", () => {
		const contract = router(
			testContract({
				path: "/search/:id",
				pathParams: z.object({ id: z.string() }),
			}),
			{ pathPrefix: "/api" },
		);

		assert.equal(contract.search.find.path, "/api/search/:id");
		assert.deepEqual(contract.search.find.requestKeys, {
			id: "pathParams",
		});
	});

	it("updates route paths when composing routes and routers", () => {
		const list = route({
			method: "GET",
			path: "/todos",
			responses: {
				204: noBody(),
			},
		});

		assert.deepEqual(list.routePath, []);

		const todos = router({ list });
		assert.deepEqual(todos.list.routePath, ["list"]);

		const contract = router({ todos });
		assert.deepEqual(contract.todos.list.routePath, ["todos", "list"]);
	});

	it("infers missing path param declarations from route paths", () => {
		const contract = router({
			todos: {
				get: {
					method: "GET",
					path: "/orgs/{orgId}/todos/:id/something/:other",
					query: z.object({ includeDone: z.boolean().optional() }),
					responses: {
						204: noBody(),
					},
				},
			},
		});

		assert.deepEqual(contract.todos.get.requestKeys, {
			id: "pathParams",
			includeDone: "query",
			orgId: "pathParams",
			other: "pathParams",
		});
		assert.equal(typeof contract.todos.get.pathParams, "object");
		assert.equal(
			contract.todos.get.pathParams?.id?.["~standard"].vendor,
			"rest-rpc",
		);
	});

	it("rejects path params in router path prefixes", () => {
		assert.throws(
			() =>
				router(
					{
						todos: {
							list: {
								method: "GET",
								path: "/todos",
								responses: {
									204: noBody(),
								},
							},
						},
					},
					{ pathPrefix: "/orgs/:orgId" },
				),
			/pathPrefix cannot include path params/,
		);
	});

	it("allows explicit no-body request declarations", () => {
		const contract = router({
			ping: {
				method: "POST",
				path: "/ping",
				body: noBody(),
				responses: {
					204: noBody(),
				},
			},
		});

		assert.deepEqual(contract.ping.requestKeys, {});
	});

	it("expands single response shorthands using the method default status", () => {
		const response = z.object({ id: z.string() });
		const contract = router({
			todos: {
				create: {
					method: "POST",
					path: "/todos",
					response,
				},
			},
		});

		assert.deepEqual(contract.todos.create.responses, {
			201: response,
		});
		assert.equal("response" in contract.todos.create, false);
	});

	it("uses a body-safe default status for DELETE response shorthands", () => {
		const response = z.object({ id: z.string() });
		const contract = router({
			todos: {
				delete: {
					method: "DELETE",
					path: "/todos/:id",
					response,
				},
			},
		});

		assert.deepEqual(contract.todos.delete.responses, {
			200: response,
		});
	});

	it("defaults omitted HTTP responses to noBody using the method default status", () => {
		const contract = router({
			todos: {
				delete: {
					method: "DELETE",
					path: "/todos/:id",
				},
			},
		});

		assert.deepEqual(Object.keys(contract.todos.delete.responses), ["204"]);
		assert.equal(isNoBody(contract.todos.delete.responses[204]), true);
	});

	it("fills empty route response records from common responses", () => {
		const response = z.object({ ok: z.boolean() });
		const contract = router(
			{
				ping: {
					method: "GET",
					path: "/ping",
					responses: {},
				},
			},
			{
				commonResponses: {
					200: response,
				},
			},
		);

		assert.deepEqual(contract.ping.responses, {
			200: response,
		});
	});

	it("allows duplicate request keys and infers path params when flattened request keys are disabled", () => {
		const contract = router(
			{
				todos: {
					get: {
						method: "GET",
						path: "/todos/:id",
						query: z.object({ id: z.string() }),
						body: z.object({ id: z.string() }),
						responses: {
							204: noBody(),
						},
					},
				},
			},
			{
				flattenRequestKeys: false,
			},
		);

		assert.equal(contract.todos.get.flattenRequestKeys, false);
		assert.equal(contract.todos.get.requestKeys, undefined);
		assert.deepEqual(Object.keys(contract.todos.get.pathParams ?? {}), ["id"]);
	});

	it("lets composed parent routers override defaulted flattened request keys", () => {
		const todos = router({
			get: {
				method: "GET",
				path: "/todos/:id",
				query: z.object({ preview: z.boolean().optional() }),
				responses: {
					204: noBody(),
				},
			},
		});
		assert.equal(todos.get.flattenRequestKeys, true);

		const contract = router(
			{
				todos,
			},
			{
				flattenRequestKeys: false,
			},
		);

		assert.equal(contract.todos.get.flattenRequestKeys, false);
	});

	it("lets composed parent routers override defaulted route flattened request keys", () => {
		const get = route({
			method: "GET",
			path: "/todos/:id",
			query: z.object({ preview: z.boolean().optional() }),
			responses: {
				204: noBody(),
			},
		});
		assert.equal(get.flattenRequestKeys, true);

		const contract = router(
			{
				todos: {
					get,
				},
			},
			{
				flattenRequestKeys: false,
			},
		);

		assert.equal(contract.todos.get.flattenRequestKeys, false);
	});

	it("preserves explicit flattened request keys when composing routers", () => {
		const todos = router(
			{
				get: {
					method: "GET",
					path: "/todos/:id",
					query: z.object({ preview: z.boolean().optional() }),
					responses: {
						204: noBody(),
					},
				},
			},
			{
				flattenRequestKeys: true,
			},
		);

		const contract = router(
			{
				todos,
			},
			{
				flattenRequestKeys: false,
			},
		);

		assert.equal(contract.todos.get.flattenRequestKeys, true);
	});

	it("merges common responses with response shorthands", () => {
		const created = z.object({ id: z.string() });
		const error = z.object({ message: z.string() });
		const contract = router(
			{
				todos: {
					create: {
						method: "POST",
						path: "/todos",
						response: created,
					},
				},
			},
			{
				commonResponses: {
					401: error,
				},
			},
		);

		assert.deepEqual(contract.todos.create.responses, {
			201: created,
			401: error,
		});
	});

	it("rejects reserved common content-type headers", () => {
		assert.throws(
			() =>
				router(
					{
						ping: {
							method: "GET",
							path: "/ping",
							responses: {
								204: noBody(),
							},
						},
					},
					{
						commonHeaders: {
							"content-type": z.string(),
						},
					},
				),
			/reserved header key "content-type"/,
		);
	});

	it("rejects common and route headers that differ only by case", () => {
		assert.throws(
			() =>
				router(
					{
						ping: {
							method: "GET",
							path: "/ping",
							headers: {
								"X-Trace-ID": z.string(),
							},
							responses: {
								204: noBody(),
							},
						},
					},
					{
						commonHeaders: {
							"x-trace-id": z.string(),
						},
					},
				),
			/duplicate header keys that differ only by case/,
		);
	});

	it("rejects reserved response content-type headers", () => {
		assert.throws(
			() =>
				router({
					ping: {
						method: "GET",
						path: "/ping",
						responses: {
							200: {
								body: z.object({ ok: z.boolean() }),
								headers: {
									"content-type": z.string(),
								},
							},
						},
					},
				}),
			/reserved response header key "content-type"/,
		);
	});

	it("rejects response headers that differ only by case", () => {
		assert.throws(
			() =>
				router({
					ping: {
						method: "GET",
						path: "/ping",
						responses: {
							200: {
								body: z.object({ ok: z.boolean() }),
								headers: {
									"X-Trace-ID": z.string(),
									"x-trace-id": z.string(),
								},
							},
						},
					},
				}),
			/duplicate response header keys that differ only by case/,
		);
	});

	it("allows OpenAPI response metadata without matching responses", () => {
		assert.doesNotThrow(() =>
			router({
				ping: {
					method: "GET",
					path: "/ping",
					openApi: {
						responses: {
							200: {
								description: "Pong.",
							},
						},
					},
					responses: {
						204: noBody(),
					},
				},
			}),
		);
	});
});
