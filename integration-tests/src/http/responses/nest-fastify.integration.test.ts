import { createNestAdapter } from "../harness/nest.ts";
import { responsesContract } from "./contract.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesHandlers } from "./handlers.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createNestAdapter(responsesContract, createResponsesHandlers(), {
		moduleOptions: {
			errorHandlers: responseErrorHandlers,
		},
		platform: "fastify",
	}),
);
