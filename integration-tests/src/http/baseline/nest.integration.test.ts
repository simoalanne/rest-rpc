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
	Implement,
	RestRpcModule,
	implement,
	route as nestRoute,
} from "@rest-rpc/nest";
import type { NextFunction, Request, Response } from "express";
import "reflect-metadata";
import z from "zod";
import { createNestAdapter } from "../harness/nest.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

declare module "@rest-rpc/nest" {
	interface DefaultContext {
		source: string;
	}
}

runClientHttpSuite(
	createNestAdapter(integrationContract, createIntegrationImplementations()),
);

it("waits for Nest Express drain before writing the next stream chunk", async () => {
	let pulledChunks = 0;
	let writeCalls = 0;
	let emitDrain: (() => void) | undefined;
	const handlers = createIntegrationImplementations();
	const nestImplementor = implement(integrationContract);
	const server = await createNestAdapter(
		integrationContract,
		{
			...handlers,
			streams: {
				...handlers.streams,
				text: nestImplementor.streams.text.handler(() => ({
					status: 200,
					body: (async function* () {
						pulledChunks = 1;
						yield "alpha\n";
						pulledChunks = 2;
						yield "beta\n";
					})(),
				})),
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
	const handlers = createIntegrationImplementations();
	const nestImplementor = implement(integrationContract);
	const server = await createNestAdapter(
		integrationContract,
		{
			...handlers,
			streams: {
				...handlers.streams,
				text: nestImplementor.streams.text.handler(() => ({
					status: 200,
					body: (async function* () {
						try {
							yield "alpha\n";
							yield "beta\n";
						} finally {
							returned = true;
						}
					})(),
				})),
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
		createIntegrationImplementations(),
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
	const collisionImplementor = implement(collisionContract);
	const server = await createNestAdapter(collisionContract, {
		a_b: collisionImplementor.a_b.handler(() => ({
			status: 200,
			body: { source: "flat" },
		})),
		a: {
			b: collisionImplementor.a.b.handler(() => ({
				status: 200,
				body: { source: "nested" },
			})),
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
		get(source: string, id: string) {
			return { id, title: `${source}:async:${id}` };
		}
	}

	@Controller()
	class AsyncItemsController {
		constructor(
			@Inject(AsyncItemService) private readonly items: AsyncItemService,
		) {}

		@Implement(asyncContract)
		async api(@Headers("x-test-source") source: string) {
			await Promise.resolve();
			return {
				get: implement(asyncContract).get.handler(({ params: { id } }) => ({
					status: 200,
					body: this.items.get(source, id),
				})),
			};
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

it("registers server-first routes and declared procedures", async () => {
	const routes = {
		health: nestRoute
			.get("/server-first-health")
			.handler(() => ({ status: 204 })),
		procedures: {
			greet: nestRoute.handler(() => ({ greeting: "hello" })),
			welcome: route.input(z.object({ name: z.string() })).output(
				z.object({ greeting: z.string() }).transform(({ greeting }) => ({
					greeting: greeting.toUpperCase(),
				})),
			),
		},
	};
	const implementations = {
		...routes,
		procedures: {
			...routes.procedures,
			welcome: implement(routes.procedures.welcome).handler(({ input }) => ({
				greeting: `Hello, ${input.name}`,
			})),
		},
	};

	@Controller()
	class ServerFirstController {
		@Implement(routes)
		api() {
			return implementations;
		}
	}

	@Module({
		imports: [RestRpcModule.forRoot()],
		controllers: [ServerFirstController],
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });

	try {
		await app.listen(0, "127.0.0.1");
		const origin = await app.getUrl();
		assert.equal((await fetch(`${origin}/server-first-health`)).status, 204);

		const procedureResponse = await fetch(`${origin}/procedures/greet`, {
			method: "POST",
		});
		assert.equal(procedureResponse.status, 200);
		assert.deepEqual(await procedureResponse.json(), { greeting: "hello" });

		const declaredProcedureResponse = await fetch(
			`${origin}/procedures/welcome`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "Nest" }),
			},
		);
		assert.equal(declaredProcedureResponse.status, 200);
		assert.deepEqual(await declaredProcedureResponse.json(), {
			greeting: "HELLO, NEST",
		});
	} finally {
		await app.close();
	}
});

it("rejects a singular procedure because it has no tree-derived path", () => {
	const procedure = route.output(schemaType<{ greeting: string }>());

	assert.throws(() => {
		@Controller()
		class InvalidProcedureController {
			@Implement(procedure)
			procedure() {
				return implement(procedure).handler(() => ({ greeting: "hello" }));
			}
		}

		return InvalidProcedureController;
	}, / requires a procedure to be part of a route tree /);
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
	@Injectable()
	class ItemService {
		formatTitle(source: string, id: string) {
			return `${source}:service:class:${id}`;
		}
	}

	@Injectable()
	class ItemRoutes {
		constructor(@Inject(ItemService) private readonly items: ItemService) {}

		readonly routes = {
			get: implement(classContract.items).get.handler(
				({ context, params: { id } }) => ({
					status: 200,
					body: {
						id,
						title: this.items.formatTitle(context.source, id),
					},
				}),
			),
		};
	}

	@Controller()
	class ItemsController {
		constructor(@Inject(ItemRoutes) private readonly routes: ItemRoutes) {}

		@Implement(classContract.items.get)
		getItem() {
			return this.routes.routes.get;
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
