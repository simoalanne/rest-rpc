import { createWebAdapter } from "../harness/web.ts";
import { createIntegrationImplementations } from "./handlers.ts";
import { runClientHttpSuite } from "./suite.ts";

runClientHttpSuite(createWebAdapter(createIntegrationImplementations()));
