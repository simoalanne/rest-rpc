import { createFastifyAdapter } from "../harness/fastify.ts";
import { createStreamsImplementations } from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

runStreamsSuite(createFastifyAdapter(createStreamsImplementations()));
