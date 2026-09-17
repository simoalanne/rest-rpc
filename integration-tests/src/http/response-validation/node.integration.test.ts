import { createNodeAdapter } from "../harness/node.ts";
import { createResponseValidationImplementations } from "./handlers.ts";
import { runResponseValidationSuite } from "./suite.ts";

runResponseValidationSuite(
	createNodeAdapter(createResponseValidationImplementations(), {
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
