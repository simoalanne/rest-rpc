import { createWebAdapter } from "../harness/web.ts";
import { createRequestValidationImplementations } from "./handlers.ts";
import { runRequestValidationSuite } from "./suite.ts";

runRequestValidationSuite(
	createWebAdapter(createRequestValidationImplementations()),
);
