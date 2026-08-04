import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	customBody,
	router,
	noBody,
	stream,
} from "@contract-first-api/core";
import z from "zod";
import {
	type CreateContextArgs,
	createRouter,
	implementContract,
	matchRoute,
} from "./initServer.ts";

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

describe("createRouter", () => {
	it("should validate input, pass route and input to implementation context, and call service", async () => {
		const apiContract = router(
			{
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
			},
			{ pathPrefix: "/api" },
		);

		let seenRequest: unknown;
		let routePathInCreateContext: string | undefined;

		const createContext = ({ route, input }: CreateContextArgs) => {
			routePathInCreateContext = route.path;
			const validatedReq = input as { id?: string };
			return {
				viewerId: `viewer:${String(validatedReq.id)}`,
			};
		};

		const implementations = [
			implementContract(apiContract.users)
				.withContext(createContext)
				.handlers({
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
			implementations,
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
		assert.equal(routePathInCreateContext, "/api/users/:id");
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
		const apiContract = router({
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
		const apiContract = router({
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

		let createContextCalled = false;
		let serviceCalled = false;
		const createContext = () => {
			createContextCalled = true;
			return {};
		};

		const implementations = [
			implementContract(apiContract.posts)
				.withContext(createContext)
				.handlers({
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
			implementations,
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
					expected: "string",
					message: "Invalid input: expected string, received undefined",
					path: ["title"],
				},
			],
		});
	});

	it("should reject contexts for websocket routes", () => {
		const apiContract = router({
			discuss: {
				connect: {
					method: "GET",
					path: "/discuss",
					options: { mode: "websocket" },
					messages: {
						client: z.object({ text: z.string() }),
						server: z.object({ text: z.string() }),
					},
				},
			},
		});

		assert.throws(
			() =>
				(
					implementContract(apiContract.discuss) as {
						withContext: (createContext: () => unknown) => {
							handlers: (handlers: unknown) => unknown;
						};
					}
				)
					.withContext(() => ({
						requestId: "request-1",
					}))
					.handlers({
						connect() {},
					}),
			/\.withContext\(\) only supports HTTP routes\. The selected contract contains websocket route "connect"\./,
		);
	});

	it("should validate custom bodies and pass them to service handlers as body", async () => {
		const apiContract = router({
			uploads: {
				inspect: {
					method: "POST",
					path: "/uploads/:id",
					request: {
						params: z.object({ id: z.string() }),
						query: z.object({
							profile: z.enum(["fast", "accurate"]).optional(),
						}),
						body: customBody({
							schema: z.instanceof(Buffer),
							contentType: "application/octet-stream",
						}),
					},
					responses: {
						200: z.object({
							id: z.string(),
							profile: z.enum(["fast", "accurate"]).optional(),
							size: z.number(),
						}),
					},
				},
			},
		});

		let seenRequest: unknown;

		const implementations = [
			implementContract(apiContract.uploads).handlers({
				inspect(request) {
					seenRequest = request;
					return {
						status: 200,
						body: {
							id: request.id,
							profile: request.profile,
							size: request.body.byteLength,
						},
					};
				},
			}),
		];

		const target = createRouteTargetDouble();
		createRouter({
			app: target.app,
			implementations,
		});

		const response = createResponseDouble();
		const body = Buffer.from("image-bytes");
		let nextError: unknown;

		await target.routes["POST /uploads/:id"](
			{
				body,
				params: { id: "file-1" },
				query: { profile: "fast" },
			},
			response.res,
			(error?: unknown) => {
				nextError = error;
			},
		);

		assert.equal(nextError, undefined);
		assert.deepStrictEqual(seenRequest, {
			id: "file-1",
			profile: "fast",
			body,
		});
		assert.deepStrictEqual(response.read(), {
			statusCode: 200,
			jsonBody: {
				id: "file-1",
				profile: "fast",
				size: body.byteLength,
			},
			writableEnded: true,
		});
	});

	it("should return 204 for routes without response schemas", async () => {
		const apiContract = router({
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

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
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
		const apiContract = router({
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

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
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
		const apiContract = router({
			health: {
				method: "GET",
				path: "/health",
				responses: {
					200: z.literal("ok"),
				},
			},
		});

		const serviceError = new Error("boom");

		const target = createRouteTargetDouble();

		createRouter({
			app: target.app,
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
		const apiContract = router({
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

		const target = createRouteTargetDouble();
		const knownError = { code: "TITLE_ALREADY_EXISTS" };
		createRouter({
			app: target.app,
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

	it("should match routes with normalized contract paths", () => {
		const apiContract = router(
			{
				uploads: {
					create: {
						method: "POST",
						path: "/uploads/:id",
						request: {
							params: z.object({ id: z.string() }),
						},
						responses: {
							204: noBody,
						},
					},
				},
			},
			{ pathPrefix: "/api" },
		);

		const req = { method: "POST", path: "/api/uploads/file-1" } as never;
		const matched = matchRoute(apiContract, req);

		assert.equal(matched, apiContract.uploads.create);
	});

	it("should prefer the most specific route when matching", () => {
		const apiContract = router(
			{
				uploads: {
					byId: {
						method: "POST",
						path: "/uploads/:id",
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
			},
			{ pathPrefix: "/api", validate: false },
		);

		const req = { method: "POST", path: "/api/uploads/static" } as never;

		const matched = matchRoute(apiContract, req);

		assert.equal(matched, apiContract.uploads.static);
	});

	it("should return null when matching misses the contract", () => {
		const apiContract = router({
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

		const req = {
			method: "POST",
			path: "/custom-upload",
		} as never;

		const matched = matchRoute(apiContract, req);

		assert.equal(matched, null);
	});
});
