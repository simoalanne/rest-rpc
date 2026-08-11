import { webAdapter } from "./adapters/web.ts";
import { runClientHttpSuite } from "./suites/clientHttpSuite.ts";

runClientHttpSuite(webAdapter);
