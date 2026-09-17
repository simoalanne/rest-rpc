import { createExpressAdapter } from "../harness/express.ts";
import type { NextFunction, Request, Response } from "express";
import { createResponseValidationImplementations } from "./handlers.ts";
import { runResponseValidationSuite } from "./suite.ts";

runResponseValidationSuite(
	createExpressAdapter(createResponseValidationImplementations(), {
		registerRoutesOptions: {
			responseValidationErrorHandler: (_error, req, res) => {
				res.status(500).header("x-error-handler", "response-validation").json({
					code: "INVALID_RESPONSE",
					path: req.path,
				});
			},
		},
		configureAppAfterRoutes: (app) => {
			app.use(
				(error: unknown, _req: Request, res: Response, _next: NextFunction) => {
					res.status(418).json({
						code: "TEAPOT",
						message: error instanceof Error ? error.message : "unknown error",
					});
				},
			);
		},
	}),
);
