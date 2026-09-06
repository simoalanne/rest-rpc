import { createNodeAdapter } from "../harness/node.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponsesSuite } from "./suite.ts";
runResponsesSuite(
	createNodeAdapter(createResponsesImplementations(), {
		createHandlerOptions: { errorHandlers: responseErrorHandlers },
	}),
);
