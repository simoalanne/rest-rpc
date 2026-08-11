import { registerRoutes, router } from "@rest-rpc/fastify";
import Fastify from "fastify";
import { createIntegrationImplementations } from "../fixtures/handlers.ts";
import type { IntegrationAdapter } from "./types.ts";

export const fastifyAdapter: IntegrationAdapter = {
	name: "fastify",
	start: async () => {
		const app = Fastify();
		registerRoutes(
			app,
			createIntegrationImplementations((contract, handlers) =>
				router(contract, handlers),
			),
		);

		const origin = await app.listen({ host: "127.0.0.1", port: 0 });

		return {
			origin,
			close: () => app.close(),
		};
	},
};
