import { createFastifyAdapter } from "../harness/fastify.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createFastifyAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			errorHandlers: responseErrorHandlers,
		},
	}),
);
