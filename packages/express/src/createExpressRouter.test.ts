import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initContracts } from "@contract-first-api/core";
import z from "zod";
import { createExpressRouter } from "./createExpressRouter.ts";
import { RequestValidationError } from "./RequestValidationError.ts";
import { initServices } from "./types.ts";

type RegisteredHandler = (
	req: {
		body?: unknown;
		query?: Record<string, unknown>;
		params?: Record<string, unknown>;
		[key: string]: unknown;
	},
	res: {
		status: (code: number) => unknown;
		json: (body: unknown) => unknown;
		end: () => unknown;
		headersSent?: boolean;
		writableEnded?: boolean;
	},
	next: (error?: unknown) => void,
) => Promise<void>;

const chainHandlers =
	(handlers: RegisteredHandler[]): RegisteredHandler =>
	async (req, res, next) => {
		let index = -1;

		const dispatch = async (
			handlerIndex: number,
			error?: unknown,
		): Promise<void> => {
			if (error !== undefined) {
				next(error);
				return;
			}

			if (handlerIndex <= index) {
				next(new Error("next() called multiple times"));
				return;
			}

			index = handlerIndex;
			const handler = handlers[handlerIndex];
			if (!handler) {
				next();
				return;
			}

			let nextPromise: Promise<void> | undefined;

			await handler(req, res, (nextError) => {
				nextPromise = dispatch(handlerIndex + 1, nextError);
			});

			await nextPromise;
		};

		await dispatch(0);
	};

const createRouteTargetDouble = () => {
	const routes: Record<string, RegisteredHandler> = {};

	return {
		routes,
		app: {
			get(path: string, ...handlers: RegisteredHandler[]) {
				routes[`GET ${path}`] = chainHandlers(handlers);
			},
			post(path: string, ...handlers: RegisteredHandler[]) {
				routes[`POST ${path}`] = chainHandlers(handlers);
			},
			put(path: string, ...handlers: RegisteredHandler[]) {
				routes[`PUT ${path}`] = chainHandlers(handlers);
			},
			delete(path: string, ...handlers: RegisteredHandler[]) {
				routes[`DELETE ${path}`] = chainHandlers(handlers);
			},
			patch(path: string, ...handlers: RegisteredHandler[]) {
				routes[`PATCH ${path}`] = chainHandlers(handlers);
			},
		},
	};
};

const createResponseDouble = () => {
	let statusCode = 200;
	let jsonBody: unknown;
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
			end() {
				writableEnded = true;
				this.headersSent = true;
			},
		},
		read: () => ({ statusCode, jsonBody, writableEnded }),
	};
};

describe("createExpressRouter", () => {
	it("should validate input, attach contract to req, create context, and call service", async () => {
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

		createExpressRouter({
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

	it("should throw RequestValidationError and skip service work when validation fails", async () => {
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

		const { defineService } = initServices<typeof contracts>();
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

		await assert.rejects(
			() =>
				handler(
					{
						body: {},
					},
					response.res,
					(error) => {
						nextError = error;
					},
				),
			(error: unknown) => {
				assert.ok(error instanceof RequestValidationError);
				assert.equal(
					error.message,
					"Request validation failed. Check the validationErrors field for details.",
				);
				assert.equal(error.statusCode, 400);
				assert.equal(error.validationErrors.length, 1);
				return true;
			},
		);

		assert.equal(createContextCalled, false);
		assert.equal(serviceCalled, false);
		assert.equal(nextError, undefined);
		assert.deepStrictEqual(response.read(), {
			statusCode: 200,
			jsonBody: undefined,
			writableEnded: false,
		});
	});

	it("should run typed middlewares before createContext and service calls", async () => {
		type ContractMeta = {
			requiresAuth?: boolean;
		};

		const { defineContract } = initContracts<ContractMeta>();
		const contracts = defineContract({
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

		const { defineMiddleware, defineService } = initServices<
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

		createExpressRouter<typeof contracts, { viewerId: string }>({
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
		assert.deepStrictEqual(response.read().jsonBody, {
			id: "post-1",
			title: "Hello",
			viewerId: "viewer-123",
		});
	});

	it("should surface service errors as rejected handler promises", async () => {
		const { defineContract } = initContracts();
		const contracts = defineContract({
			health: {
				method: "GET",
				path: "/health",
				response: z.literal("ok"),
			},
		});

		const { defineService } = initServices<typeof contracts>();
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

		await assert.rejects(
			() =>
				handler({}, response.res, (error) => {
					nextError = error;
				}),
			(error: unknown) => error === serviceError,
		);

		assert.equal(nextError, undefined);
		assert.equal(response.read().jsonBody, undefined);
	});
});
