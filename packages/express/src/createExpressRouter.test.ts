import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initContracts, noBody, stream } from "@contract-first-api/core";
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
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			users: {
				getById: {
					method: "GET",
					path: "/users/:id",
					request: {
						params: z.object({ id: z.string() }),
						query: z.object({ includePosts: z.coerce.boolean().optional() }),
					},
					responses: {
						200: z.object({
							id: z.string(),
							viewerId: z.string(),
							includePosts: z.boolean().optional(),
						}),
					},
				},
			},
		});

		const { createRouter, implementContract } = initServer<
			typeof apiContract,
			{ viewerId: string }
		>();

		let seenRequest: unknown;
		let contractPathInCreateContext: string | undefined;

		const implementations = [
			implementContract(apiContract.users).handlers({
				async getById(request) {
					seenRequest = request;
					return {
						status: 200,
						body: {
							id: request.id,
							viewerId: request.context.viewerId,
							includePosts: request.includePosts,
						},
					};
				},
			}),
		];

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contract: apiContract,
			implementations,
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

	it("should write streaming routes as ndjson chunks", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			events: {
				stream: {
					method: "GET",
					path: "/events",
					responses: {
						200: stream(
							z.object({
								type: z.string(),
								payload: z.string(),
							}),
						),
					},
				},
			},
		});

		const { createRouter, implementContract } = initServer<typeof apiContract>();
		const implementations = [
			implementContract(apiContract.events).handlers({
				stream() {
					return (async function* () {
						yield { type: "joined", payload: "Ada" };
						yield { type: "left", payload: "Linus" };
					})();
				},
			}),
		];

		const target = createRouteTargetDouble();
		createRouter({
			app: target.app,
			contract: apiContract,
			implementations,
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
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({
							title: z.string().min(1),
						}),
					},
					responses: {
						201: z.object({
							id: z.string(),
						}),
					},
				},
			},
		});

		const { createRouter, implementContract } = initServer<typeof apiContract>();
		let createContextCalled = false;
		let serviceCalled = false;

		const implementations = [
			implementContract(apiContract.posts).handlers({
				async create() {
					serviceCalled = true;
					return {
						status: 201,
						body: { id: "1" },
					};
				},
			}),
		];

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contract: apiContract,
			implementations,
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

		const { defineContract } = initContracts<ContractMeta>();
		const apiContract = defineContract({
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
					responses: {
						201: z.object({
							id: z.string(),
							title: z.string(),
							viewerId: z.string(),
						}),
					},
				},
			},
		});

		const { createRouter, defineMiddleware, implementContract } = initServer<
			typeof apiContract,
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

		const implementations = [
			implementContract(apiContract.posts).handlers({
				create({ title, context }) {
					seen.viewerIdInService = context.viewerId;
					return {
						status: 201,
						body: {
							id: "post-1",
							title,
							viewerId: context.viewerId,
						},
					};
				},
			}),
		];

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contract: apiContract,
			implementations,
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
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			posts: {
				delete: {
					method: "DELETE",
					path: "/posts/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});

		const { createRouter, implementContract } = initServer<typeof apiContract>();
		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contract: apiContract,
			implementations: [
				implementContract(apiContract.posts).handlers({
					delete() {
						return {
							status: 204,
							body: undefined,
						};
					},
				}),
			],
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

	it("should use declared success status codes", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					responses: {
						202: z.object({ id: z.string() }),
					},
				},
			},
		});

		const { createRouter, implementContract } = initServer<typeof apiContract>();
		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contract: apiContract,
			implementations: [
				implementContract(apiContract.posts).handlers({
					create() {
						return {
							status: 202,
							body: { id: "post-1" },
						};
					},
				}),
			],
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
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			health: {
				method: "GET",
				path: "/health",
				responses: {
					200: z.literal("ok"),
				},
			},
		});

		const { createRouter, implementContract } = initServer<typeof apiContract>();
		const serviceError = new Error("boom");

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
			contract: apiContract,
			implementations: [
				implementContract(apiContract.health).handler(async () => {
					throw serviceError;
				}),
			],
		});

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

	it("should return non-success route responses as flat JSON", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			todos: {
				create: {
					method: "POST",
					path: "/todos",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						201: z.object({ id: z.string() }),
						409: z.object({
							code: z.literal("TITLE_ALREADY_EXISTS"),
						}),
					},
				},
			},
		});

		const { createRouter, implementContract } = initServer<typeof apiContract>();
		const target = createRouteTargetDouble();
		const knownError = { code: "TITLE_ALREADY_EXISTS" };
		createRouter({
			app: target.app,
			contract: apiContract,
			implementations: [
				implementContract(apiContract.todos).handlers({
					create() {
						return {
							status: 409,
							body: knownError,
						};
					},
				}),
			],
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
			statusCode: 409,
			jsonBody: knownError,
			writableEnded: true,
		});
	});

	it("should not run nonRaw middleware for raw request routes", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			uploads: {
				create: {
					method: "POST",
					path: "/uploads/:id",
					request: {
						params: z.object({ id: z.string() }),
					},
					options: { mode: "raw" },
					responses: {
						204: noBody,
					},
				},
			},
		});

		const { createRouteModeMiddleware } = initServer<typeof apiContract>();
		let middlewareCalls = 0;
		const wrappedMiddleware = createRouteModeMiddleware({
			contract: apiContract,
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

	it("should run nonRaw middleware for non-raw routes", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});

		const { createRouteModeMiddleware } = initServer<typeof apiContract>();
		let middlewareCalls = 0;
		const wrappedMiddleware = createRouteModeMiddleware({
			contract: apiContract,
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

	it("should route requests to raw and non-raw middlewares based on route mode", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			uploads: {
				create: {
					method: "POST",
					path: "/uploads",
					options: { mode: "raw" },
					responses: {
						204: noBody,
					},
				},
			},
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});

		const { createRouteModeMiddleware } = initServer<typeof apiContract>();
		const seenCalls: string[] = [];
		const middleware = createRouteModeMiddleware({
			contract: apiContract,
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

	it("should prefer the most specific matching route when selecting middleware", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			uploads: {
				byId: {
					method: "POST",
					path: "/uploads/:id",
					options: { mode: "raw" },
					responses: {
						204: noBody,
					},
				},
				static: {
					method: "POST",
					path: "/uploads/static",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});

		const { createRouteModeMiddleware } = initServer<typeof apiContract>();
		const seenCalls: string[] = [];
		const middleware = createRouteModeMiddleware({
			contract: apiContract,
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

	it("should skip both middlewares when the request does not match a route", async () => {
		const { defineContract } = initContracts();
		const apiContract = defineContract({
			posts: {
				create: {
					method: "POST",
					path: "/posts",
					request: {
						body: z.object({ title: z.string() }),
					},
					responses: {
						204: noBody,
					},
				},
			},
		});

		const { createRouteModeMiddleware } = initServer<typeof apiContract>();
		const seenCalls: string[] = [];
		const middleware = createRouteModeMiddleware({
			contract: apiContract,
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
