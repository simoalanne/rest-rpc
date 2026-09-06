import { createNodeAdapter } from "../harness/node.ts";
import {
	createStreamCancellationProbe,
	createStreamsImplementations,
} from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

const cancellationProbe = createStreamCancellationProbe();

runStreamsSuite({
	...createNodeAdapter(createStreamsImplementations({ cancellationProbe })),
	cancellationProbe,
});
