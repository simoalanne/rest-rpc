import { createServer } from "node:http";
import { registerRoutes, router } from "@rest-rpc/express";
import express from "express";
import { createIntegrationImplementations } from "../fixtures/handlers.ts";
import { listen } from "../fixtures/listen.ts";
import type { IntegrationAdapter } from "./types.ts";

export const expressAdapter: IntegrationAdapter = {
	name: "express",
	start: async () => {
		const app = express();
		app.use(express.text({ type: "text/plain" }));
		app.use(express.json());
		registerRoutes(
			app,
			createIntegrationImplementations((contract, handlers) =>
				router(contract, handlers),
			),
		);

		return listen(createServer(app));
	},
};
