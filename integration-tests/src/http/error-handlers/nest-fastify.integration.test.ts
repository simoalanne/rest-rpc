import { HttpAdapterHost } from "@nestjs/core";
import { createNestAdapter } from "../harness/nest.ts";
import { errorHandlersContract } from "./contract.ts";
import { createErrorHandlerState } from "./state.ts";
import { createErrorHandlersHandlers } from "./handlers.ts";
import { ErrorHandlersExceptionFilter } from "./nestExceptionFilter.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createNestAdapter(errorHandlersContract, createErrorHandlersHandlers(state), {
		configureApp: (app) => {
			app.useGlobalFilters(
				new ErrorHandlersExceptionFilter(app.get(HttpAdapterHost), state),
			);
		},
		platform: "fastify",
	}),
);
