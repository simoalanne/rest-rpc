import { createFastifyAdapter } from "../harness/fastify.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createFastifyAdapter(createIntegrationImplementations()));
