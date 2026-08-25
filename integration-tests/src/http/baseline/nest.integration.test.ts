import assert from "node:assert/strict";
import { after, it } from "node:test";
import {
	Controller,
	Headers,
	Inject,
	Injectable,
	Module,
	Sse,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { initClient } from "@rest-rpc/core";
import {
	route as contractRoute,
	router as contractRouter,
	type as schemaType,
} from "@rest-rpc/core/contract";
import {
	RestRpcModule,
	Route,
	type RouteHandlers,
	type RouteRequest,
	Router,
	router,
} from "@rest-rpc/nest";
import { of } from "rxjs";
import "reflect-metadata";
import { createNestAdapter } from "../harness/nest.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationHandlers } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(
	createNestAdapter(integrationContract, createIntegrationHandlers()),
);

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

		assert.equal(await client.health.fetch(), undefined);
		assert.equal((await fetch(`${server.origin}/api/v1/health`)).status, 204);
		assert.equal((await fetch(`${server.origin}/health`)).status, 404);
	} finally {
		await server.close();
	}
});

it("registers router routes whose contract key paths would produce the same flattened name", async () => {
	const collisionContract = contractRouter({
		a_b: contractRoute({
			method: "GET",
			path: "/flat",
			response: schemaType<{ source: string }>(),
		}),
		a: {
			b: contractRoute({
				method: "GET",
				path: "/nested",
				response: schemaType<{ source: string }>(),
			}),
		},
	});
	const server = await createNestAdapter(collisionContract, {
		a_b: () => ({ source: "flat" }),
		a: {
			b: () => ({ source: "nested" }),
		},
	}).start();

	try {
		const client = initClient(collisionContract, { baseUrl: server.origin });

		assert.deepEqual(await client.a_b.fetch(), { source: "flat" });
		assert.deepEqual(await client.a.b.fetch(), { source: "nested" });
	} finally {
		await server.close();
	}
});

it("supports async routers that close over values from Nest parameter decorators", async () => {
	const asyncContract = contractRouter({
		get: contractRoute({
			method: "GET",
			path: "/async-items/:id",
			pathParams: { id: schemaType<string>() },
			headers: { "x-test-source": schemaType<string>() },
			response: schemaType<{ id: string; title: string }>(),
		}),
	});
	@Injectable()
	class AsyncItemService {
		get(source: string, { id }: RouteRequest<typeof asyncContract.get>) {
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

		assert.deepEqual(
			await client.get.fetch({
				id: "item-1",
				"x-test-source": "decorated",
			}),
			{ id: "item-1", title: "decorated:async:item-1" },
		);
	} finally {
		await app.close();
	}
});

it("passes non-rest-rpc Observable handlers through the global interceptor", async () => {
	@Controller()
	class EventsController {
		@Sse("events")
		events() {
			return of({ data: { index: 1 } }, { data: { index: 2 } });
		}
	}

	@Module({
		imports: [RestRpcModule.forRoot()],
		controllers: [EventsController],
	})
	class AppModule {}

	const app = await NestFactory.create(AppModule, { logger: false });

	try {
		await app.listen(0, "127.0.0.1");
		const response = await fetch(`${await app.getUrl()}/events`);

		assert.equal(response.status, 200);
		assert.match(
			response.headers.get("content-type") ?? "",
			/^text\/event-stream/,
		);
		assert.deepEqual((await response.text()).match(/^data: .*$/gm), [
			'data: {"index":1}',
			'data: {"index":2}',
		]);
	} finally {
		await app.close();
	}
});

const classContract = contractRouter({
	items: {
		get: contractRoute({
			method: "GET",
			path: "/class-items/:id",
			response: schemaType<{ id: string; title: string }>(),
		}),
	},
});

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
	class ItemRoutes
		implements RouteHandlers<typeof classContract.items, AppContext>
	{
		constructor(@Inject(ItemService) private readonly items: ItemService) {}

		get({
			id,
			context,
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
			return router<typeof classContract.items, AppContext>(
				classContract.items,
				this.routes,
			).get;
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
	after(async () => {
		await app.close();
	});

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
});
