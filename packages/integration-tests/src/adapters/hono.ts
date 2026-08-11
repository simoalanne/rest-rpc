import type { Server } from "node:http";
import { createAdaptorServer } from "@hono/node-server";
import { isCustomBody } from "@rest-rpc/core/contract";
import { registerRoutes, router } from "@rest-rpc/hono";
import { Hono } from "hono";
import { createIntegrationImplementations } from "../fixtures/handlers.ts";
import { listen } from "../fixtures/listen.ts";
import type { IntegrationAdapter } from "./types.ts";

export const honoAdapter: IntegrationAdapter = {
	name: "hono",
	start: async () => {
		const app = new Hono();
		registerRoutes(
			app,
			createIntegrationImplementations((contract, handlers) =>
				router(contract, handlers),
			),
			{
				parseBody: ({ body, c }) =>
					isCustomBody(body) && body.contentType === "text/plain"
						? c.req.text()
						: c.req.json(),
			},
		);

		const server = createAdaptorServer({
			fetch: app.fetch,
		}) as Server;

		return listen(server);
	},
};
