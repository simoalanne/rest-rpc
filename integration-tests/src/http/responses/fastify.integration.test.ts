import { createFastifyAdapter } from "../harness/fastify.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createFastifyAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			responseValidationErrorHandler: (_error, request, reply) => {
				return reply
					.status(500)
					.header("x-error-handler", "response-validation")
					.send({
						code: "INVALID_RESPONSE",
						path: request.routeOptions.url,
					});
			},
		},
		configureApp: (app) => {
			app.setErrorHandler((error, _request, reply) => {
				return reply.status(418).send({
					code: "TEAPOT",
					message: error.message,
				});
			});
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
