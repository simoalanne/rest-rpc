import { createFastifyAdapter } from "../harness/fastify.ts";
import {
	createErrorHandlerState,
	createErrorHandlers,
} from "./errorHandlers.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createFastifyAdapter(createErrorHandlersImplementations(state), {
		registerRoutesOptions: {
			errorHandlers: createErrorHandlers(state),
		},
	}),
);
