import { createExpressAdapter } from "../harness/express.ts";
import { responseErrorHandlers } from "./errorHandlers.ts";
import { createResponsesImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./middlewareSuite.ts";
import { runResponsesSuite } from "./suite.ts";

runResponsesSuite(
	createExpressAdapter(createResponsesImplementations(), {
		registerRoutesOptions: {
			errorHandlers: responseErrorHandlers,
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
