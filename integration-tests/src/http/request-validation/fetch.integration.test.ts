import { createFetchAdapter } from "../harness/fetch.ts";
import { createRequestValidationImplementations } from "./handlers.ts";
import { runRequestValidationSuite } from "./suite.ts";

runRequestValidationSuite(
	createFetchAdapter(createRequestValidationImplementations()),
);
