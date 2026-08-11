import type { StartedServer } from "../fixtures/listen.ts";

export type IntegrationAdapter = {
	name: "web" | "express" | "hono" | "fastify";
	start(): Promise<StartedServer>;
};
