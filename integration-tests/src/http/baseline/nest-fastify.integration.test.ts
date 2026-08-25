import { createNestAdapter } from "../harness/nest.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationHandlers } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(
	createNestAdapter(integrationContract, createIntegrationHandlers(), {
		platform: "fastify",
	}),
);
