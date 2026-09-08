import { createHonoAdapter } from "../harness/hono.ts";
import { createErrorHandlerState } from "./state.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createHonoAdapter(createErrorHandlersImplementations(state), {
		registerRoutesOptions: {
			requestValidationErrorHandler: (error, c) => {
				state.validationErrors += 1;
				const issueCount = Object.values(error.issues).reduce(
					(count, issues) => count + issues.length,
					0,
				);

				c.header("x-error-handler", "request-validation");
				return c.json(
					{
						code: "VALIDATION_ERROR",
						issueCount,
						path: c.req.path,
					},
					422,
				);
			},
		},
		configureApp: (app) => {
			app.onError((error, c) => {
				state.unhandledErrors += 1;
				c.header("x-error-handler", "unhandled");
				return c.json(
					{
						code: "UNHANDLED_ERROR",
						message: error.message,
						path: c.req.path,
					},
					503,
				);
			});
		},
	}),
);
