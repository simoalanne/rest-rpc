import type { IncomingMessage } from "node:http";
import { route } from "../builder/routeBuilder.ts";
import { createApp, type NodeApp } from "./createApp.ts";

type Env = { DB: { name: string } };

const routes = {
	health: route
		.$context<{ db?: Env["DB"] | number }>()
		.get("/health")
		.handler(() => "ok"),
};

describe("createApp", () => {
	it("passes the Node request to the context function", () => {
		expectTypeOf(createApp(routes)).toEqualTypeOf<NodeApp>();
		createApp(routes, {
			context: (request) => {
				expectTypeOf(request).toEqualTypeOf<IncomingMessage>();
				return { db: 1 };
			},
		});
		createApp(routes, {
			// @ts-expect-error Node passes no arguments after the request.
			context: (_request, env: Env) => ({ db: env.DB }),
		});
	});
});
