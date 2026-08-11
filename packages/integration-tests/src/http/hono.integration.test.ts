import { honoAdapter } from "./adapters/hono.ts";
import { runClientHttpSuite } from "./suites/clientHttpSuite.ts";

runClientHttpSuite(honoAdapter);
