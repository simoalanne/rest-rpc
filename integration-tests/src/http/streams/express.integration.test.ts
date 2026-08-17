import { createExpressAdapter } from "../harness/express.ts";
import {
	createStreamCancellationProbe,
	createStreamsImplementations,
} from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

const cancellationProbe = createStreamCancellationProbe();

runStreamsSuite({
	...createExpressAdapter(createStreamsImplementations({ cancellationProbe })),
	cancellationProbe,
});
