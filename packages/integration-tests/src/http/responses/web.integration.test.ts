import { createWebAdapter } from "../harness/web.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createWebAdapter(createResponsesImplementations(), {
		createHandlerOptions: {
			errorHandlers: responseErrorHandlers,
		},
	}),
);
