import assert from "node:assert/strict";
import { it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
	Controller,
	Headers,
	Inject,
	Injectable,
	Module,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { initClient, route, type as schemaType } from "@rest-rpc/core";
import {
	RestRpcModule,
	Route,
	type RouteHandlers,
	type RouteRequest,
	Router,
	router,
} from "@rest-rpc/nest";
import type { NextFunction, Request, Response } from "express";
import "reflect-metadata";
import { createNestAdapter } from "../harness/nest.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationHandlers } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(
	createNestAdapter(integrationContract, createIntegrationHandlers()),
);

it("waits for Nest Express drain before writing the next stream chunk", async () => {
	let pulledChunks = 0;
	let writeCalls = 0;
	let emitDrain: (() => void) | undefined;
	const handlers = createIntegrationHandlers();
	const server = await createNestAdapter(
		integrationContract,
		{
			...handlers,
			streams: {
				...handlers.streams,
				text: async function* () {
					pulledChunks = 1;
					yield "alpha\n";
					pulledChunks = 2;
					yield "beta\n";
				},
			},
		},
		{
			configureApp: (app) => {
				app.use(
					"/streams/text",
					(_req: Request, res: Response, next: NextFunction) => {
						const originalWrite = res.write.bind(res) as (
							...args: unknown[]
						) => boolean;
						res.write = ((...args: unknown[]) => {
							writeCalls += 1;
							const result = originalWrite(...args);
							if (writeCalls === 1) return false;
							return result;
						}) as typeof res.write;
						emitDrain = () => {
							res.emit("drain");
						};
						next();
					},
				);
			},
		},
	).start();

	try {
		const response = await fetch(`${server.origin}/streams/text`);

		await delay(25);
		assert.equal(writeCalls, 1);
		assert.equal(typeof emitDrain, "function");

		emitDrain();

		assert.equal(await response.text(), "alpha\nbeta\n");
		assert.equal(pulledChunks, 2);
	} finally {
		await server.close();
	}
});

it("releases a Nest Express backpressure wait when the response closes before drain", async () => {
	let writeCalls = 0;
	let returned = false;
	let closeResponse: (() => void) | undefined;
	const handlers = createIntegrationHandlers();
	const server = await createNestAdapter(
		integrationContract,
		{
			...handlers,
			streams: {
				...handlers.streams,
				text: async function* () {
					try {
						yield "alpha\n";
						yield "beta\n";
					} finally {
						returned = true;
					}
				},
			},
		},
		{
			configureApp: (app) => {
				app.use(
					"/streams/text",
					(_req: Request, res: Response, next: NextFunction) => {
						const originalWrite = res.write.bind(res) as (
							...args: unknown[]
						) => boolean;
						res.write = ((...args: unknown[]) => {
							writeCalls += 1;
							const result = originalWrite(...args);
							if (writeCalls === 1) return false;
							return result;
						}) as typeof res.write;
						closeResponse = () => {
							res.destroy();
						};
						next();
					},
				);
			},
		},
	).start();

	try {
		const request = fetch(`${server.origin}/streams/text`).catch(
			() => undefined,
		);

		await delay(25);
		assert.equal(writeCalls, 1);
		assert.equal(typeof closeResponse, "function");

		closeResponse();
		await delay(25);

		assert.equal(writeCalls, 1);
		assert.equal(returned, true);
		await request;
	} finally {
		await server.close();
	}
});

it("combines Nest controller prefixes with contract route paths", async () => {
	const server = await createNestAdapter(
		integrationContract,
		createIntegrationHandlers(),
		{ controllerPrefix: "api/v1" },
	).start();

	try {
		const client = initClient(integrationContract, {
			baseUrl: `${server.origin}/api/v1`,
		});

		const healthResponse = await client.health();
		assert.equal(healthResponse.status, 204);
		assert.equal(healthResponse.body, undefined);
		assert.equal((await fetch(`${server.origin}/api/v1/health`)).status, 204);
		assert.equal((await fetch(`${server.origin}/health`)).status, 404);
	} finally {
		await server.close();
	}
});

it("registers router routes whose contract key paths would produce the same flattened name", async () => {
	const collisionContract = {
		a_b: route.get("/flat").response(200, schemaType<{ source: string }>()),
		a: {
			b: route.get("/nested").response(200, schemaType<{ source: string }>()),
		},
	} as const;
	const server = await createNestAdapter(collisionContract, {
		a_b: () => ({ source: "flat" }),
		a: {
			b: () => ({ source: "nested" }),
		},
	}).start();

	try {
		const client = initClient(collisionContract, { baseUrl: server.origin });

		const flatResponse = await client.a_b();
		assert.equal(flatResponse.status, 200);
		assert.deepEqual(flatResponse.body, { source: "flat" });
		const nestedResponse = await client.a.b();
		assert.equal(nestedResponse.status, 200);
		assert.deepEqual(nestedResponse.body, { source: "nested" });
	} finally {
		await server.close();
	}
});

it("supports async routers that close over values from Nest parameter decorators", async () => {
	const asyncContract = {
		get: route
			.get("/async-items/:id")
			.params(schemaType<{ id: string }>())
			.headers(schemaType<{ "x-test-source": string }>())
			.response(200, schemaType<{ id: string; title: string }>()),
	} as const;
	@Injectable()
	class AsyncItemService {
		get(
			source: string,
			{ params: { id } }: RouteRequest<typeof asyncContract.get>,
		) {
			return { id, title: `${source}:async:${id}` };
		}
	}

	@Controller()
	class AsyncItemsController {
		constructor(
			@Inject(AsyncItemService) private readonly items: AsyncItemService,
		) {}

		@Router(asyncContract)
		async api(@Headers("x-test-source") source: string) {
			await Promise.resolve();
			return router(asyncContract, {
				get: (request) => this.items.get(source, request),
			});
		}
	}

	@Module({
		imports: [RestRpcModule.forRoot()],
		controllers: [AsyncItemsController],
		providers: [AsyncItemService],
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });

	try {
		await app.listen(0, "127.0.0.1");
		const client = initClient(asyncContract, { baseUrl: await app.getUrl() });

		const response = await client.get({
			params: { id: "item-1" },
			headers: { "x-test-source": "decorated" },
		});
		assert.equal(response.status, 200);
		assert.deepEqual(response.body, {
			id: "item-1",
			title: "decorated:async:item-1",
		});
	} finally {
		await app.close();
	}
});

const classContract = {
	items: {
		get: route
			.get("/class-items/:id")
			.params(schemaType<{ id: string }>())
			.response(200, schemaType<{ id: string; title: string }>()),
	},
} as const;

it("serves a contract route implemented by a Nest provider class", async () => {
	type AppContext = {
		source: string;
	};

	@Injectable()
	class ItemService {
		formatTitle(source: string, id: string) {
			return `${source}:service:class:${id}`;
		}
	}

	@Injectable()
	class ItemRoutes implements RouteHandlers<typeof classContract.items> {
		constructor(@Inject(ItemService) private readonly items: ItemService) {}

		get({
			context,
			params: { id },
		}: RouteRequest<typeof classContract.items.get, AppContext>) {
			return {
				id,
				title: this.items.formatTitle(context.source, id),
			};
		}
	}

	@Controller()
	class ItemsController {
		constructor(@Inject(ItemRoutes) private readonly routes: ItemRoutes) {}

		@Route(classContract.items.get)
		getItem() {
			return router(classContract.items, this.routes).get;
		}
	}

	@Module({
		imports: [
			RestRpcModule.forRoot({
				createContext: (context) => {
					const req = context
						.switchToHttp()
						.getRequest<{ headers: Record<string, unknown> }>();
					return {
						source: String(req.headers["x-test-source"] ?? "nest"),
					};
				},
			}),
		],
		controllers: [ItemsController],
		providers: [ItemRoutes, ItemService],
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });

	try {
		await app.listen(0, "127.0.0.1");
		const response = await fetch(`${await app.getUrl()}/class-items/item-1`, {
			headers: {
				"x-test-source": "provider",
			},
		});

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			id: "item-1",
			title: "provider:service:class:item-1",
		});
	} finally {
		await app.close();
	}
});

it("passes controller-local context to Nest provider route handlers", async () => {
	type AppContext = {
		source: string;
		tenant: string;
	};

	@Injectable()
	class ItemRoutes implements RouteHandlers<typeof classContract.items> {
		get({
			context,
			params: { id },
		}: RouteRequest<typeof classContract.items.get, AppContext>) {
			return {
				id,
				title: `${context.source}:${context.tenant}:${id}`,
			};
		}
	}

	@Controller()
	class ItemsController {
		constructor(@Inject(ItemRoutes) private readonly routes: ItemRoutes) {}

		@Router(classContract.items)
		items(@Headers("x-test-tenant") tenant: string) {
			return router(classContract.items, this.routes, {
				context: { tenant },
			});
		}
	}

	@Module({
		imports: [
			RestRpcModule.forRoot({
				createContext: (context) => {
					const req = context
						.switchToHttp()
						.getRequest<{ headers: Record<string, unknown> }>();
					return {
						source: String(req.headers["x-test-source"] ?? "nest"),
					};
				},
			}),
		],
		controllers: [ItemsController],
		providers: [ItemRoutes],
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });

	try {
		await app.listen(0, "127.0.0.1");
		const response = await fetch(`${await app.getUrl()}/class-items/item-1`, {
			headers: {
				"x-test-source": "module",
				"x-test-tenant": "controller",
			},
		});

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			id: "item-1",
			title: "module:controller:item-1",
		});
	} finally {
		await app.close();
	}
});
