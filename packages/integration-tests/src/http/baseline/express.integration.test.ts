import { createExpressAdapter } from "../harness/express.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createExpressAdapter(createIntegrationImplementations()));
