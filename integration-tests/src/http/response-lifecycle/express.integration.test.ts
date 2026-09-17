import { createExpressAdapter } from "../harness/express.ts";
import { createResponseLifecycleImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./suite.ts";

runResponseMiddlewareHeadersSuite(
	createExpressAdapter(createResponseLifecycleImplementations(), {
		configureApp: (app) => {
			app.use((_req, res, next) => {
				res.setHeader("x-express-middleware", "set");
				next();
			});
		},
	}),
	{ "x-express-middleware": "set" },
);
