import { createExpressAdapter } from "../harness/express.ts";
import { createStreamsImplementations } from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

runStreamsSuite(createExpressAdapter(createStreamsImplementations()));
