import { createExpressAdapter } from "../harness/express.ts";
import { createRequestValidationImplementations } from "./handlers.ts";
import { runRequestValidationSuite } from "./suite.ts";

runRequestValidationSuite(
	createExpressAdapter(createRequestValidationImplementations()),
);
