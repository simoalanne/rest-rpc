import { createFastifyAdapter } from "../harness/fastify.ts";
import { createResponseValidationImplementations } from "./handlers.ts";
import { runResponseValidationSuite } from "./suite.ts";

runResponseValidationSuite(
	createFastifyAdapter(createResponseValidationImplementations(), {
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
					message: error instanceof Error ? error.message : "unknown error",
				});
			});
		},
	}),
);
