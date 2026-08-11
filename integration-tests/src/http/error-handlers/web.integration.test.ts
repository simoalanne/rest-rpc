import { createWebAdapter } from "../harness/web.ts";
import {
	createErrorHandlerState,
	createErrorHandlers,
} from "./errorHandlers.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createWebAdapter(createErrorHandlersImplementations(state), {
		createHandlerOptions: {
			errorHandlers: createErrorHandlers(state),
		},
	}),
);
