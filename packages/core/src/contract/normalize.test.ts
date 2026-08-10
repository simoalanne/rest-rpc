import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { testContract, testRoute } from "../../test/factories/contract.ts";
import { normalizeContract } from "./normalize.ts";

describe("normalizeContract", () => {
	it("normalizes shared path prefixes onto route declarations", () => {
		const contract = normalizeContract(
			{
				todos: {
					list: testRoute({ path: "/todos" }),
				},
				health: testRoute({ path: "/" }),
			},
			{ pathPrefix: "/api/" },
		);

		assert.equal(contract.todos.list.path, "/api/todos");
		assert.equal(contract.health.path, "/api");
	});

	it("applies shared path prefixes each time normalization runs", () => {
		const contract = normalizeContract(testContract({ path: "/todos" }), {
			pathPrefix: "/api",
		});

		normalizeContract(contract, { pathPrefix: "/api" });

		assert.equal(contract.search.find.path, "/api/api/todos");
	});

	it("populates empty metadata on route declarations", () => {
		const contract = normalizeContract(testContract());

		assert.deepEqual(contract.search.find.metadata, {});
	});

	it("merges shared metadata with route metadata", () => {
		const contract = normalizeContract(
			{
				todos: {
					list: testRoute({
						metadata: {
							auth: "optional",
							audit: true,
						},
					}),
					create: testRoute(),
				},
			},
			{
				metadata: {
					auth: "required",
					source: "api",
				},
			},
		);

		assert.deepEqual(contract.todos.list.metadata, {
			auth: "optional",
			audit: true,
			source: "api",
		});
		assert.deepEqual(contract.todos.create.metadata, {
			auth: "required",
			source: "api",
		});
	});

	it("merges shared responses with route responses", () => {
		const contract = normalizeContract(
			{
				todos: {
					get: testRoute({
						responses: {
							200: {},
							404: { name: "route not found" },
						},
					}),
					create: testRoute({
						method: "POST",
						responses: {
							201: {},
						},
					}),
				},
			},
			{
				commonResponses: {
					401: { name: "unauthorized" },
					404: { name: "common not found" },
				},
			},
		);

		assert.deepEqual(contract.todos.get.responses, {
			200: {},
			401: { name: "unauthorized" },
			404: { name: "route not found" },
		});
		assert.deepEqual(contract.todos.create.responses, {
			201: {},
			401: { name: "unauthorized" },
			404: { name: "common not found" },
		});
	});

	it("merges shared OpenAPI options with route OpenAPI options", () => {
		const contract = normalizeContract(
			{
				todos: {
					list: testRoute({
						openApi: {
							summary: "List todos",
							tags: ["Todos", "Read"],
							deprecated: false,
							responseDescriptions: {
								200: "Todos returned.",
							},
							extensions: {
								"x-route": true,
							},
						},
					}),
					create: testRoute(),
				},
			},
			{
				commonOpenApi: {
					tags: ["Todos"],
					deprecated: true,
					security: [{ bearerAuth: [] }],
					responseDescriptions: {
						200: "Success.",
						401: "Authentication is required.",
					},
					extensions: {
						"x-common": true,
						"x-route": false,
					},
				},
			},
		);

		assert.deepEqual(contract.todos.list.openApi, {
			summary: "List todos",
			tags: ["Todos", "Read"],
			deprecated: false,
			security: [{ bearerAuth: [] }],
			responseDescriptions: {
				200: "Todos returned.",
				401: "Authentication is required.",
			},
			extensions: {
				"x-common": true,
				"x-route": true,
			},
		});
		assert.deepEqual(contract.todos.create.openApi, {
			tags: ["Todos"],
			deprecated: true,
			security: [{ bearerAuth: [] }],
			responseDescriptions: {
				200: "Success.",
				401: "Authentication is required.",
			},
			extensions: {
				"x-common": true,
				"x-route": false,
			},
		});
	});
});
