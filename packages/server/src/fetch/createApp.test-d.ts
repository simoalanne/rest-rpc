import { route } from "../builder/routeBuilder.ts";
import { createApp, type App } from "./createApp.ts";

type Env = { DB: { name: string } };

const routes = {
	health: route
		.$context<{ db?: Env["DB"] | number }>()
		.get("/health")
		.handler(() => "ok"),
};

describe("createApp", () => {
	it("infers the runtime arguments from the context function", () => {
		expectTypeOf(createApp(routes)).toEqualTypeOf<App>();
		expectTypeOf(
			createApp(routes, { context: { db: 1 } }),
		).toEqualTypeOf<App>();

		const app = createApp(routes, {
			context: (_request, env: Env) => ({ db: env.DB }),
		});
		expectTypeOf(app).toEqualTypeOf<App<[env: Env]>>();
		expectTypeOf(app.fetch).parameters.toEqualTypeOf<[Request, Env]>();
	});
});
