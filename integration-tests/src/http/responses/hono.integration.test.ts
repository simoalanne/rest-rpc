import { createHonoAdapter } from "../harness/hono.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createHonoAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			errorHandlers: responseErrorHandlers,
		},
	}),
);
