import { createNestAdapter } from "../harness/nest.ts";
import { requestValidationContract } from "./contract.ts";
import { createRequestValidationImplementations } from "./handlers.ts";
import { runRequestValidationSuite } from "./suite.ts";

runRequestValidationSuite(
	createNestAdapter(
		requestValidationContract,
		createRequestValidationImplementations(),
		{ platform: "fastify" },
	),
);
