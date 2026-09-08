import { createNodeAdapter } from "../harness/node.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponsesSuite } from "./suite.ts";
runResponsesSuite(
	createNodeAdapter(createResponsesImplementations(), {
		createHandlerOptions: {
			responseValidationErrorHandler: (_error, req, res) => {
				res.statusCode = 500;
				res.setHeader("content-type", "application/json");
				res.setHeader("x-error-handler", "response-validation");
				res.end(
					JSON.stringify({
						code: "INVALID_RESPONSE",
						path: new URL(req.url ?? "/", "http://localhost").pathname,
					}),
				);
			},
		},
		handleError: (error, _req, res) => {
			res.statusCode = 418;
			res.setHeader("content-type", "application/json");
			res.end(
				JSON.stringify({
					code: "TEAPOT",
					message: error instanceof Error ? error.message : "unknown error",
				}),
			);
		},
	}),
);
