import { createNestAdapter } from "../harness/nest.ts";
import { integrationContract } from "./contract.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(
	createNestAdapter(integrationContract, createIntegrationImplementations(), {
		platform: "fastify",
	}),
);
