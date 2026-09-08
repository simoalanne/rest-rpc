import { createExpressAdapter } from "../harness/express.ts";
import { createErrorHandlerState } from "./state.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createExpressAdapter(createErrorHandlersImplementations(state), {
		registerRoutesOptions: {
			requestValidationErrorHandler: (error, req, res) => {
				state.validationErrors += 1;
				const issueCount = Object.values(error.issues).reduce(
					(count, issues) => count + issues.length,
					0,
				);

				res.status(422).header("x-error-handler", "request-validation").json({
					code: "VALIDATION_ERROR",
					issueCount,
					path: req.path,
				});
			},
		},
		configureAppAfterRoutes: (app) => {
			app.use((error: unknown, req, res, _next) => {
				state.unhandledErrors += 1;
				res
					.status(503)
					.header("x-error-handler", "unhandled")
					.json({
						code: "UNHANDLED_ERROR",
						message: error instanceof Error ? error.message : "unknown error",
						path: req.path,
					});
			});
		},
	}),
);
