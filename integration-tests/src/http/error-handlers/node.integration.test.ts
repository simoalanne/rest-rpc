import { createNodeAdapter } from "../harness/node.ts";
import {
	createErrorHandlerState,
	createErrorHandlers,
} from "./errorHandlers.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createNodeAdapter(createErrorHandlersImplementations(state), {
		createHandlerOptions: {
			errorHandlers: createErrorHandlers(state),
		},
	}),
);
