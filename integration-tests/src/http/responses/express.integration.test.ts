import { createExpressAdapter } from "../harness/express.ts";
import type { NextFunction, Request, Response } from "express";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createExpressAdapter(createResponsesImplementations(), {
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

runResponseMiddlewareHeadersSuite(
	createExpressAdapter(createResponsesImplementations(), {
		configureApp: (app) => {
			app.use((_req, res, next) => {
				res.setHeader("x-express-middleware", "set");
				next();
			});
		},
	}),
	{ "x-express-middleware": "set" },
);
