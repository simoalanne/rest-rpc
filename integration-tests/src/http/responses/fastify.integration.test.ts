import { createFastifyAdapter } from "../harness/fastify.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createFastifyAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			errorHandlers: responseErrorHandlers,
		},
	}),
);

runResponseMiddlewareHeadersSuite(
	createFastifyAdapter(createResponsesImplementations(), {
		configureApp: (app) => {
			app.addHook("onRequest", (_request, reply, done) => {
				reply.header("x-fastify-middleware", "set");
				done();
			});
		},
	}),
	{ "x-fastify-middleware": "set" },
);
