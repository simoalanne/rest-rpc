import { createFastifyAdapter } from "../harness/fastify.ts";
import { createRequestValidationImplementations } from "./handlers.ts";
import { runRequestValidationSuite } from "./suite.ts";

runRequestValidationSuite(
	createFastifyAdapter(createRequestValidationImplementations()),
);
