import { createExpressAdapter } from "../harness/express.ts";
import {
	createErrorHandlerState,
	createErrorHandlers,
} from "./errorHandlers.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createExpressAdapter(createErrorHandlersImplementations(state), {
		registerRoutesOptions: {
			errorHandlers: createErrorHandlers(state),
		},
	}),
);
