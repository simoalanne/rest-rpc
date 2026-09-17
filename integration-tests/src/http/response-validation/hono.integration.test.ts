import type { ResponseValidationErrorHandler } from "@rest-rpc/hono";
import { createHonoAdapter } from "../harness/hono.ts";
import { createResponseValidationImplementations } from "./handlers.ts";
import { runResponseValidationSuite } from "./suite.ts";

const responseValidationErrorHandler: ResponseValidationErrorHandler = (
	_error,
	c,
) => {
	c.header("x-error-handler", "response-validation");
	return c.json(
		{
			code: "INVALID_RESPONSE",
			path: c.req.path,
		},
		500,
	);
};

runResponseValidationSuite(
	createHonoAdapter(createResponseValidationImplementations(), {
		registerRoutesOptions: {
			responseValidationErrorHandler,
		},
		configureApp: (app) => {
			app.onError((error, c) =>
				c.json(
					{
						code: "TEAPOT",
						message: error.message,
					},
					418,
				),
			);
		},
	}),
);
