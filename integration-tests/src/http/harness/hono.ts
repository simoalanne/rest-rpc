import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import {
	type HttpRouteDeclaration,
	isCustomBody,
} from "@rest-rpc/core/contract";
import {
	type HonoParseBody,
	type RegisterRoutesOptions,
	registerRoutes,
} from "@rest-rpc/hono";
import type { ImplementationTree } from "@rest-rpc/server";
import { Hono } from "hono";
import { listen } from "./listen.ts";

const parseTextOrJsonBody: HonoParseBody = ({ body, c }) =>
	isCustomBody(body) && body.contentType === "text/plain"
		? c.req.text()
		: c.req.json();

export type HonoAdapterOptions = {
	configureApp?: (app: Hono) => void;
	registerRoutesOptions?: RegisterRoutesOptions;
};

export const createHonoAdapter = (
	implementations: ImplementationTree<HttpRouteDeclaration>,
	options: HonoAdapterOptions = {},
) => ({
	name: "hono",
	start: async () => {
		const app = new Hono();
		options.configureApp?.(app);
		registerRoutes(app, implementations, {
			parseBody: parseTextOrJsonBody,
			...options.registerRoutesOptions,
		});

		const server = createAdaptorServer({
			fetch: app.fetch,
		}) as Server;

		return listen(server);
	},
});
