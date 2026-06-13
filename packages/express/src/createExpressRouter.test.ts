import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initContracts } from "@contract-first-api/core";
import z from "zod";
import { initServer } from "./initServer.ts";

const chainHandlers = (handlers: ((...args: any[]) => unknown)[]) => {
	return async (
		req: Record<string, unknown>,
		res: Record<string, unknown>,
		next: (error?: unknown) => void,
	) => {
		const run = async (index: number): Promise<void> => {
			const handler = handlers[index];
			if (!handler) {
				next();
				return;
			}

			let nextCalled = false;
			let nextError: unknown;

			try {
				await handler(req, res, (error?: unknown) => {
					nextCalled = true;
					nextError = error;
				});
			} catch (error) {
				next(error);
				return;
			}

			if (!nextCalled) return;
			if (nextError !== undefined) {
				next(nextError);
				return;
			}

			await run(index + 1);
		};

		await run(0);
	};
};

const createRouteTargetDouble = () => {
	const routes: Record<string, ReturnType<typeof chainHandlers>> = {};
	const register =
		(method: string) =>
		(path: string, ...handlers: ((...args: any[]) => unknown)[]) => {
			routes[`${method} ${path}`] = chainHandlers(handlers);
		};

	return {
		routes,
		app: {
			get: register("GET"),
			post: register("POST"),
			put: register("PUT"),
			delete: register("DELETE"),
			patch: register("PATCH"),
		},
	};
};

const createResponseDouble = () => {
	let statusCode = 200;
	let jsonBody: unknown;
	const headers: Record<string, string> = {};
	let bodyText = "";
	let writableEnded = false;

	return {
		res: {
			headersSent: false,
			get writableEnded() {
				return writableEnded;
			},
			status(code: number) {
				statusCode = code;
				return this;
			},
			json(body: unknown) {
				jsonBody = body;
				writableEnded = true;
				this.headersSent = true;
				return body;
			},
			setHeader(name: string, value: string) {
				headers[name] = value;
			},
			write(chunk: string) {
				bodyText += chunk;
				this.headersSent = true;
			},
			sendStatus(code: number) {
				statusCode = code;
				jsonBody = undefined;
				writableEnded = true;
				this.headersSent = true;
				return code;
			},
			end() {
				writableEnded = true;
				this.headersSent = true;
			},
		},
		read: () => ({ statusCode, jsonBody, writableEnded }),
		readStream: () => ({ headers, bodyText }),
	};
};

describe("initServer", () => {
	it("should validate input, attach contract to req, create context, and call service", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
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

		const { createRouter, defineService } = initServer<
			typeof contracts,
			{ viewerId: string }
		>();

		let seenRequest: unknown;
		let contractPathInCreateContext: string | undefined;

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

		createRouter({
			app: target.app,
			contracts,
			services,
			routePrefix: "/api",
			createContext: (req) => {
				contractPathInCreateContext = req.contract.path;
				const validatedReq = req.validatedRequest as { id?: string };
				return {
					viewerId: `viewer:${String(validatedReq.id)}`,
				};
			},
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
		assert.equal(contractPathInCreateContext, "/users/:id");
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
			},
			writableEnded: true,
		});
	});

	it("should write stream contracts as ndjson chunks", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			events: {
				stream: {
					method: "GET",
					path: "/events",
					response: z.object({
						type: z.string(),
						payload: z.string(),
					}),
					options: { mode: "stream" },
				},
			},
		});

		const { createRouter, defineService } = initServer<typeof contracts>();
		const services = {
			events: defineService("events", {
				async *stream() {
					yield { type: "joined", payload: "Ada" };
					yield { type: "left", payload: "Linus" };
				},
			}),
		};

		const target = createRouteTargetDouble();
		createRouter({
			app: target.app,
			contracts,
			services,
		});

		const response = createResponseDouble();
		let nextError: unknown;

		await target.routes["GET /events"](
			{
				body: {},
				query: {},
				params: {},
				path: "/events",
			},
			response.res,
			(error?: unknown) => {
				nextError = error;
			},
		);

		assert.equal(nextError, undefined);
		assert.deepStrictEqual(response.read(), {
			statusCode: 200,
			jsonBody: undefined,
			writableEnded: true,
		});
		assert.deepStrictEqual(response.readStream(), {
			headers: { "content-type": "application/x-ndjson" },
			bodyText:
				'{"type":"joined","payload":"Ada"}\n{"type":"left","payload":"Linus"}\n',
		});
	});

	it("should return validation errors as JSON and skip service work", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
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

		const { createRouter, defineService } = initServer<typeof contracts>();
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

		createRouter({
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
		const result = response.read();
		assert.equal(result.statusCode, 400);
		assert.equal(result.writableEnded, true);
		assert.deepStrictEqual(result.jsonBody, {
			message:
				"Request validation failed. Check the validationErrors field for details.",
			validationErrors: [
				{
					code: "invalid_type",
					message: "Invalid input: expected string, received undefined",
					path: ["title"],
				},
			],
		});
	});

	it("should run typed middlewares before createContext and service calls", async () => {
		type ContractMeta = {
			requiresAuth?: boolean;
		};

		const { defineContractTree } = initContracts<ContractMeta>();
		const contracts = defineContractTree({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					meta: {
						requiresAuth: true,
					},
					request: {
						body: z.object({
							title: z.string().min(1),
						}),
					},
					response: z.object({
						id: z.string(),
						title: z.string(),
						viewerId: z.string(),
					}),
				},
			},
		});

		const { createRouter, defineMiddleware, defineService } = initServer<
			typeof contracts,
			{ viewerId: string }
		>();

		const seen: {
			inputTitle?: string;
			requiresAuth?: boolean;
			viewerIdFromMiddleware?: string;
			viewerIdInService?: string;
			contractPath?: string;
		} = {};

		const authMiddleware = defineMiddleware(async (req, _res, next) => {
			const enrichedReq = req as typeof req & { viewerId?: string };
			seen.inputTitle = String(req.validatedRequest.title);
			seen.requiresAuth = req.contract.meta?.requiresAuth;
			seen.contractPath = req.contract.path;
			enrichedReq.viewerId = "viewer-123";
			next();
		});

		const services = {
			posts: defineService("posts", {
				create({ title, context }) {
					seen.viewerIdInService = context.viewerId;
					return {
						id: "post-1",
						title,
						viewerId: context.viewerId,
					};
				},
			}),
		};

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contracts,
			services,
			middlewares: [authMiddleware],
			createContext: (req) => {
				const enrichedReq = req as typeof req & { viewerId?: string };
				seen.viewerIdFromMiddleware = String(enrichedReq.viewerId);
				return {
					viewerId: String(enrichedReq.viewerId),
				};
			},
		});

		const handler = target.routes["POST /posts"];
		assert.ok(handler);

		const response = createResponseDouble();
		let nextError: unknown;

		await handler(
			{
				body: {
					title: "Hello",
				},
			},
			response.res,
			(error) => {
				nextError = error;
			},
		);

		assert.equal(nextError, undefined);
		assert.deepStrictEqual(seen, {
			inputTitle: "Hello",
			requiresAuth: true,
			contractPath: "/posts",
			viewerIdFromMiddleware: "viewer-123",
			viewerIdInService: "viewer-123",
		});
		assert.deepStrictEqual(response.read(), {
			statusCode: 201,
			jsonBody: {
				id: "post-1",
				title: "Hello",
				viewerId: "viewer-123",
			},
			writableEnded: true,
		});
	});

	it("should return 204 for routes without response schemas", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			posts: {
				delete: {
					method: "DELETE",
					path: "/posts/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
				},
			},
		});

		const { createRouter, defineService } = initServer<typeof contracts>();
		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contracts,
			services: {
				posts: defineService("posts", {
					delete() {},
				}),
			},
		});

		const handler = target.routes["DELETE /posts/:id"];
		assert.ok(handler);

		const response = createResponseDouble();
		let nextError: unknown;

		await handler(
			{
				params: {
					id: "post-1",
				},
			},
			response.res,
			(error) => {
				nextError = error;
			},
		);

		assert.equal(nextError, undefined);
		assert.deepStrictEqual(response.read(), {
			statusCode: 204,
			jsonBody: undefined,
			writableEnded: true,
		});
	});

	it("should use custom success status codes when provided", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					successStatusCode: 202,
					response: z.object({ id: z.string() }),
				},
			},
		});

		const { createRouter, defineService } = initServer<typeof contracts>();
		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contracts,
			services: {
				posts: defineService("posts", {
					create() {
						return { id: "post-1" };
					},
				}),
			},
		});

		const handler = target.routes["POST /posts"];
		assert.ok(handler);

		const response = createResponseDouble();
		let nextError: unknown;

		await handler({}, response.res, (error) => {
			nextError = error;
		});

		assert.equal(nextError, undefined);
		assert.deepStrictEqual(response.read(), {
			statusCode: 202,
			jsonBody: { id: "post-1" },
			writableEnded: true,
		});
	});

	it("should pass service errors to the next error handler", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			health: {
				method: "GET",
				path: "/health",
				response: z.literal("ok"),
			},
		});

		const { createRouter, defineService } = initServer<typeof contracts>();
		const serviceError = new Error("boom");

		const target = createRouteTargetDouble();

		createRouter({
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

	it("should return known contract errors as flat JSON", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			todos: {
				create: {
					method: "POST",
					path: "/todos",
					request: {
						body: z.object({ title: z.string() }),
					},
					response: z.object({ id: z.string() }),
					errors: z.object({
						code: z.literal("TITLE_ALREADY_EXISTS"),
					}),
				},
			},
		});

		const { createRouter, defineService, throwKnownError } =
			initServer<typeof contracts>();
		const target = createRouteTargetDouble();
		const knownError = { code: "TITLE_ALREADY_EXISTS" };
		createRouter({
			app: target.app,
			contracts,
			services: {
				todos: defineService("todos", {
					create() {
						throwKnownError(knownError);
					},
				}),
			},
		});

		const handler = target.routes["POST /todos"];
		assert.ok(handler);

		const response = createResponseDouble();
		let nextError: unknown;

		await handler(
			{
				body: {
					title: "Hello",
				},
			},
			response.res,
			(error) => {
				nextError = error;
			},
		);

		assert.equal(nextError, undefined);
		assert.deepStrictEqual(response.read(), {
			statusCode: 400,
			jsonBody: knownError,
			writableEnded: true,
		});
	});

	it("should not run nonRaw middleware for raw request contracts", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			uploads: {
				create: {
					method: "POST",
					path: "/uploads/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					options: { mode: "raw" },
				},
			},
		});

		const { createContractModeMiddleware } = initServer<typeof contracts>();
		let middlewareCalls = 0;
		const wrappedMiddleware = createContractModeMiddleware({
			contracts,
			nonRaw: (req, _res, next) => {
				middlewareCalls += 1;
				(req as typeof req & { parsedByJson?: boolean }).parsedByJson = true;
				next();
			},
			routePrefix: "/api",
		});

		let nextCalled = false;
		await wrappedMiddleware(
			{
				method: "POST",
				path: "/api/uploads/file-1",
			} as never,
			{} as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, true);
		assert.equal(middlewareCalls, 0);
	});

	it("should run nonRaw middleware for non-raw contracts", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({ title: z.string() }),
					},
				},
			},
		});

		const { createContractModeMiddleware } = initServer<typeof contracts>();
		let middlewareCalls = 0;
		const wrappedMiddleware = createContractModeMiddleware({
			contracts,
			nonRaw: (_req, _res, next) => {
				middlewareCalls += 1;
				next();
			},
		});

		let nextCalled = false;
		await wrappedMiddleware(
			{
				method: "POST",
				path: "/posts",
			} as never,
			{} as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, true);
		assert.equal(middlewareCalls, 1);
	});

	it("should route requests to raw and non-raw middlewares based on contract mode", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			uploads: {
				create: {
					method: "POST",
					path: "/uploads",
					options: { mode: "raw" },
				},
			},
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({ title: z.string() }),
					},
				},
			},
		});

		const { createContractModeMiddleware } = initServer<typeof contracts>();
		const seenCalls: string[] = [];
		const middleware = createContractModeMiddleware({
			contracts,
			raw: (_req, _res, next) => {
				seenCalls.push("raw");
				next();
			},
			nonRaw: (_req, _res, next) => {
				seenCalls.push("nonRaw");
				next();
			},
			routePrefix: "/api",
		});

		await middleware(
			{
				method: "POST",
				path: "/api/uploads",
			} as never,
			{} as never,
			() => {},
		);
		await middleware(
			{
				method: "POST",
				path: "/api/posts",
			} as never,
			{} as never,
			() => {},
		);

		assert.deepStrictEqual(seenCalls, ["raw", "nonRaw"]);
	});

	it("should prefer the most specific matching contract when selecting middleware", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			uploads: {
				byId: {
					method: "POST",
					path: "/uploads/:id",
					options: { mode: "raw" },
				},
				static: {
					method: "POST",
					path: "/uploads/static",
					request: {
						body: z.object({ title: z.string() }),
					},
				},
			},
		});

		const { createContractModeMiddleware } = initServer<typeof contracts>();
		const seenCalls: string[] = [];
		const middleware = createContractModeMiddleware({
			contracts,
			raw: (_req, _res, next) => {
				seenCalls.push("raw");
				next();
			},
			nonRaw: (_req, _res, next) => {
				seenCalls.push("nonRaw");
				next();
			},
			routePrefix: "/api",
		});

		await middleware(
			{
				method: "POST",
				path: "/api/uploads/static",
			} as never,
			{} as never,
			() => {},
		);

		assert.deepStrictEqual(seenCalls, ["nonRaw"]);
	});

	it("should skip both middlewares when the request does not match a contract route", async () => {
		const { defineContractTree } = initContracts();
		const contracts = defineContractTree({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({ title: z.string() }),
					},
				},
			},
		});

		const { createContractModeMiddleware } = initServer<typeof contracts>();
		const seenCalls: string[] = [];
		const middleware = createContractModeMiddleware({
			contracts,
			raw: (_req, _res, next) => {
				seenCalls.push("raw");
				next();
			},
			nonRaw: (_req, _res, next) => {
				seenCalls.push("nonRaw");
				next();
			},
		});

		let nextCalled = false;
		await middleware(
			{
				method: "POST",
				path: "/custom-upload",
			} as never,
			{} as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, true);
		assert.deepStrictEqual(seenCalls, []);
	});
});
