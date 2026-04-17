import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initContracts } from "@contract-first-api/core";
import z from "zod";
import { createExpressRouter } from "./createExpressRouter.ts";
import { initServices } from "./types.ts";

type RegisteredHandler = (
	req: {
		body?: unknown;
		query?: Record<string, unknown>;
		params?: Record<string, unknown>;
	},
	res: {
		status: (code: number) => unknown;
		json: (body: unknown) => unknown;
	},
	next: (error?: unknown) => void,
) => Promise<void>;

const createRouteTargetDouble = () => {
	const routes: Record<string, RegisteredHandler> = {};

	return {
		routes,
		app: {
			get(path: string, handler: RegisteredHandler) {
				routes[`GET ${path}`] = handler;
			},
			post(path: string, handler: RegisteredHandler) {
				routes[`POST ${path}`] = handler;
			},
			put(path: string, handler: RegisteredHandler) {
				routes[`PUT ${path}`] = handler;
			},
			delete(path: string, handler: RegisteredHandler) {
				routes[`DELETE ${path}`] = handler;
			},
			patch(path: string, handler: RegisteredHandler) {
				routes[`PATCH ${path}`] = handler;
			},
		},
	};
};

const createResponseDouble = () => {
	let statusCode = 200;
	let jsonBody: unknown;

	return {
		res: {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(body: unknown) {
				jsonBody = body;
				return body;
			},
		},
		read: () => ({ statusCode, jsonBody }),
	};
};

describe("createExpressRouter", () => {
	it("should validate input, create context, call service, and transform the response", async () => {
		const { defineContract } = initContracts();
		const contracts = defineContract({
			users: {
				getById: {
					method: "GET",
					path: "/users/:id",
					request: {
						params: z.object({ id: z.string() }),
						query: z.object({ includePosts: z.coerce.boolean().optional() }),
					},
					response: z.object({
						id: z.string(),
						viewerId: z.string(),
						includePosts: z.boolean().optional(),
					}),
				},
			},
		});

		const { defineService } = initServices<
			typeof contracts,
			{ viewerId: string }
		>(contracts);

		let seenRequest: unknown;

		const services = {
			users: defineService("users", {
				async getById(request) {
					seenRequest = request;
					return {
						id: request.id,
						viewerId: request.context.viewerId,
						includePosts: request.includePosts,
					};
				},
			}),
		};

		const target = createRouteTargetDouble();

		createExpressRouter({
			app: target.app,
			contracts,
			services,
			routePrefix: "/api",
			createContext: ({ input }) => ({
				viewerId: `viewer:${String(input.id)}`,
			}),
			transformResponse: ({ data }) => ({
				...data,
				transformed: true,
			}),
		});

		const handler = target.routes["GET /api/users/:id"];
		assert.ok(handler);

		const response = createResponseDouble();
		let nextError: unknown;

		await handler(
			{
				params: { id: "123" },
				query: { includePosts: "true" },
			},
			response.res,
			(error) => {
				nextError = error;
			},
		);

		assert.equal(nextError, undefined);
		assert.deepStrictEqual(seenRequest, {
			id: "123",
			includePosts: true,
			context: {
				viewerId: "viewer:123",
			},
		});
		assert.deepStrictEqual(response.read(), {
			statusCode: 200,
			jsonBody: {
				id: "123",
				viewerId: "viewer:123",
				includePosts: true,
				transformed: true,
			},
		});
	});

	it("should return 400 and skip service work when validation fails", async () => {
		const { defineContract } = initContracts();
		const contracts = defineContract({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({
							title: z.string().min(1),
						}),
					},
					response: z.object({
						id: z.string(),
					}),
				},
			},
		});

		const { defineService } = initServices(contracts);
		let createContextCalled = false;
		let serviceCalled = false;

		const services = {
			posts: defineService("posts", {
				async create() {
					serviceCalled = true;
					return { id: "1" };
				},
			}),
		};

		const target = createRouteTargetDouble();

		createExpressRouter({
			app: target.app,
			contracts,
			services,
			createContext: () => {
				createContextCalled = true;
				return {};
			},
		});

		const handler = target.routes["POST /posts"];
		assert.ok(handler);

		const response = createResponseDouble();
		let nextError: unknown;

		await handler(
			{
				body: {},
			},
			response.res,
			(error) => {
				nextError = error;
			},
		);

		assert.equal(createContextCalled, false);
		assert.equal(serviceCalled, false);
		assert.equal(nextError, undefined);
		assert.equal(response.read().statusCode, 400);
		assert.equal(
			typeof (response.read().jsonBody as { message: string }).message,
			"string",
		);
	});

	it("should forward service errors to next by default", async () => {
		const { defineContract } = initContracts();
		const contracts = defineContract({
			health: {
				method: "GET",
				path: "/health",
				response: z.literal("ok"),
			},
		});

		const { defineService } = initServices(contracts);
		const serviceError = new Error("boom");

		const target = createRouteTargetDouble();

		createExpressRouter({
			app: target.app,
			contracts,
			services: {
				health: async () => {
					throw serviceError;
				},
			},
		});
		void defineService;

		const handler = target.routes["GET /health"];
		assert.ok(handler);

		const response = createResponseDouble();
		let nextError: unknown;

		await handler({}, response.res, (error) => {
			nextError = error;
		});

		assert.equal(nextError, serviceError);
		assert.equal(response.read().jsonBody, undefined);
	});
});
