import { createWebAdapter } from "../harness/web.ts";
import { createStreamsImplementations } from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

runStreamsSuite(createWebAdapter(createStreamsImplementations()));
