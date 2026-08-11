import { createHonoAdapter } from "../harness/hono.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createHonoAdapter(createIntegrationImplementations()));
