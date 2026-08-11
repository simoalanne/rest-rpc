import { createHonoAdapter } from "../harness/hono.ts";
import { createStreamsImplementations } from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

runStreamsSuite(createHonoAdapter(createStreamsImplementations()));
