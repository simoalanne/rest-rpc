import { createNestAdapter } from "../harness/nest.ts";
import { errorHandlersContract } from "./contract.ts";
import {
	createErrorHandlerState,
	createErrorHandlers,
} from "./errorHandlers.ts";
import { createErrorHandlersHandlers } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createNestAdapter(errorHandlersContract, createErrorHandlersHandlers(state), {
		moduleOptions: {
			errorHandlers: createErrorHandlers(state),
		},
		platform: "fastify",
	}),
);
