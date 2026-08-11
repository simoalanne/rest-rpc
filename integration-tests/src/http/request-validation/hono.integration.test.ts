import { createHonoAdapter } from "../harness/hono.ts";
import { createRequestValidationImplementations } from "./handlers.ts";
import { runRequestValidationSuite } from "./suite.ts";

runRequestValidationSuite(
	createHonoAdapter(createRequestValidationImplementations()),
);
