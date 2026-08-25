import { createNestAdapter } from "../harness/nest.ts";
import { streamsContract } from "./contract.ts";
import {
	createStreamCancellationProbe,
	createStreamsHandlers,
} from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

const cancellationProbe = createStreamCancellationProbe();

runStreamsSuite({
	...createNestAdapter(
		streamsContract,
		createStreamsHandlers({ cancellationProbe }),
		{ platform: "fastify" },
	),
	cancellationProbe,
});
