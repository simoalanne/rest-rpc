import { createFetchAdapter } from "../harness/fetch.ts";
import {
	createErrorHandlerState,
	createErrorHandlers,
} from "./errorHandlers.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createFetchAdapter(createErrorHandlersImplementations(state), {
		createHandlerOptions: {
			errorHandlers: createErrorHandlers(state),
		},
	}),
);
