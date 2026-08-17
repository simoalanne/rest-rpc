import { createFastifyAdapter } from "../harness/fastify.ts";
import {
	createStreamCancellationProbe,
	createStreamsImplementations,
} from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

const cancellationProbe = createStreamCancellationProbe();

runStreamsSuite({
	...createFastifyAdapter(createStreamsImplementations({ cancellationProbe })),
	cancellationProbe,
});
