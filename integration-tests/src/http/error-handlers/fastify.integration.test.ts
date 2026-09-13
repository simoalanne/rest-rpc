import { createFastifyAdapter } from "../harness/fastify.ts";
import { createErrorHandlerState } from "./state.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createFastifyAdapter(createErrorHandlersImplementations(state), {
		registerRoutesOptions: {
			requestValidationErrorHandler: (error, request, reply) => {
				state.validationErrors += 1;
				const issueCount = Object.values(error.issues).reduce(
					(count, issues) => count + issues.length,
					0,
				);

				return reply
					.status(422)
					.header("x-error-handler", "request-validation")
					.send({
						code: "VALIDATION_ERROR",
						issueCount,
						path: request.routeOptions.url,
					});
			},
		},
		configureApp: (app) => {
			app.setErrorHandler((error, request, reply) => {
				state.unhandledErrors += 1;
				return reply
					.status(503)
					.header("x-error-handler", "unhandled")
					.send({
						code: "UNHANDLED_ERROR",
						message: error instanceof Error ? error.message : "unknown error",
						path: request.routeOptions.url,
					});
			});
		},
	}),
);
