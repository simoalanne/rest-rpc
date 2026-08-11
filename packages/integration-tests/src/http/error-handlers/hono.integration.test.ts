import { createHonoAdapter } from "../harness/hono.ts";
import {
	createErrorHandlerState,
	createErrorHandlers,
} from "./errorHandlers.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createHonoAdapter(createErrorHandlersImplementations(state), {
		registerRoutesOptions: {
			errorHandlers: createErrorHandlers(state),
		},
	}),
);
