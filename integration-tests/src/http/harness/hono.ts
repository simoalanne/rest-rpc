import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { type RegisterRoutesOptions, registerRoutes } from "@rest-rpc/hono";
import type { ImplementationTree } from "@rest-rpc/server";
import { Hono } from "hono";
import { listen } from "./listen.ts";

export type HonoAdapterOptions = {
	configureApp?: (app: Hono) => void;
	registerRoutesOptions?: RegisterRoutesOptions;
};

export const createHonoAdapter = (
	implementations: ImplementationTree,
	options: HonoAdapterOptions = {},
) => ({
	name: "hono",
	start: async () => {
		const app = new Hono();
		options.configureApp?.(app);
		registerRoutes(app, implementations, options.registerRoutesOptions);

		const server = createAdaptorServer({
			fetch: app.fetch,
		}) as Server;

		return listen(server);
	},
});
