import { createNodeAdapter } from "../harness/node.ts";
import { createRequestValidationImplementations } from "./handlers.ts";
import { runRequestValidationSuite } from "./suite.ts";

runRequestValidationSuite(
	createNodeAdapter(createRequestValidationImplementations()),
);
