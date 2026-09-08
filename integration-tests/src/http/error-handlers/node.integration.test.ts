import { createNodeAdapter } from "../harness/node.ts";
import { createErrorHandlerState } from "./state.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createNodeAdapter(createErrorHandlersImplementations(state), {
		createHandlerOptions: {
			requestValidationErrorHandler: (error, req, res) => {
				state.validationErrors += 1;
				const issueCount = Object.values(error.issues).reduce(
					(count, issues) => count + issues.length,
					0,
				);

				res.statusCode = 422;
				res.setHeader("content-type", "application/json");
				res.setHeader("x-error-handler", "request-validation");
				res.end(
					JSON.stringify({
						code: "VALIDATION_ERROR",
						issueCount,
						path: new URL(req.url ?? "/", "http://localhost").pathname,
					}),
				);
			},
		},
		handleError: (error, req, res) => {
			state.unhandledErrors += 1;
			res.statusCode = 503;
			res.setHeader("content-type", "application/json");
			res.setHeader("x-error-handler", "unhandled");
			res.end(
				JSON.stringify({
					code: "UNHANDLED_ERROR",
					message: error instanceof Error ? error.message : "unknown error",
					path: new URL(req.url ?? "/", "http://localhost").pathname,
				}),
			);
		},
	}),
);
