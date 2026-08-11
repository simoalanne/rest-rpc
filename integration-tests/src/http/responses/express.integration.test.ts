import { createExpressAdapter } from "../harness/express.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createExpressAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			errorHandlers: responseErrorHandlers,
		},
	}),
);
