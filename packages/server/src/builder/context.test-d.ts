import { type } from "@rest-rpc/core";
import { call } from "../pipeline/call.ts";
import {
	compileRoutes,
	createCatchAllHandler,
} from "../pipeline/compileRoutes.ts";
import { createApp } from "../pipeline/createApp.ts";
import { implement } from "./implement.ts";
import { route } from "./routeBuilder.ts";

// Optional, so the augmentation does not require context of other tests.
declare module "./context.ts" {
	interface DefaultContext {
		requestStartedAt?: number;
		tenant?: string;
	}
}

describe("context types", () => {
	it("intersects route context with the default context", () => {
		route
			.$context<{ user: string; tenant: "acme" }>()
			.get("/")
			.handler(({ context }) => {
				expectTypeOf(context.requestStartedAt).toEqualTypeOf<
					number | undefined
				>();
				expectTypeOf(context.user).toEqualTypeOf<string>();
				expectTypeOf(context.tenant).toEqualTypeOf<"acme">();
				return "ok";
			});
		route.get("/").handler(({ context }) => {
			expectTypeOf(context.tenant).toEqualTypeOf<string | undefined>();
			return "ok";
		});
	});

	it("intersects contract implementation context with the default context", () => {
		const contract = { get: route.get("/").response(type<string>()) };
		implement(contract)
			.$context<{ user: string }>()
			.get.handler(({ context }) => {
				expectTypeOf(context.requestStartedAt).toEqualTypeOf<
					number | undefined
				>();
				expectTypeOf(context.user).toEqualTypeOf<string>();
				return "ok";
			});
		implement(contract)
			.get.$context<{ user: string }>()
			.handler(({ context }) => context.user);
	});
});

describe("host context", () => {
	const open = route.get("/open").handler(() => "ok");
	const withUser = route
		.$context<{ user: string }>()
		.get("/user")
		.handler(({ context }) => context.user);
	const withDb = route
		.$context<{ db: number }>()
		.get("/db")
		.handler(({ context }) => context.db);
	const injected = route
		.use(({ next }) => next({ context: { user: "1" } }))
		.get("/injected")
		.handler(({ context }) => context.user);

	it("requires the intersection of the initial contexts of a route tree", () => {
		createApp({ open, injected });
		// @ts-expect-error The routes require user.
		createApp({ open, withUser });
		createApp({ withUser }, { context: { user: "1" } });
		// @ts-expect-error The routes require db too.
		createApp({ withUser, withDb }, { context: { user: "1" } });
		createApp(
			{ nested: { withUser }, withDb },
			{ context: async () => ({ user: "1", db: 1 }) },
		);
	});

	it("requires the initial context of compiled routes and the catch-all handler", () => {
		const routes = compileRoutes({ withUser, withDb });
		const request = new Request("http://localhost/user");
		// @ts-expect-error The routes require user and db.
		void routes[0]!.handle(request);
		void routes[0]!.handle(request, { context: { user: "1", db: 1 } });
		const handler = createCatchAllHandler(routes);
		// @ts-expect-error The routes require user and db.
		void handler(request);
		void handler(request, { context: { user: "1", db: 1 } });
		void compileRoutes({ open })[0]!.handle(request);
	});

	it("requires the initial context of a called route", () => {
		void call(open);
		void call(injected);
		// @ts-expect-error The route requires user.
		void call(withUser);
		void call(withUser, undefined, { context: { user: "1" } });
	});
});
