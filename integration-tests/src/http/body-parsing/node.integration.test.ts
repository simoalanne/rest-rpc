import { createNodeAdapter } from "../harness/node.ts";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";
runBodyParsingSuite(createNodeAdapter(createBodyParsingImplementations()));
