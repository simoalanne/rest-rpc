import { createFetchAdapter } from "../harness/fetch.ts";
import {
	createStreamCancellationProbe,
	createStreamsImplementations,
} from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

const cancellationProbe = createStreamCancellationProbe();

runStreamsSuite({
	...createFetchAdapter(createStreamsImplementations({ cancellationProbe })),
	cancellationProbe,
});
