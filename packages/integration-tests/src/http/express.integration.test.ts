import { expressAdapter } from "./adapters/express.ts";
import { runClientHttpSuite } from "./suites/clientHttpSuite.ts";

runClientHttpSuite(expressAdapter);
