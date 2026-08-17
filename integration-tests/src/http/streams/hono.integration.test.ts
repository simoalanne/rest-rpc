import { createHonoAdapter } from "../harness/hono.ts";
import {
	createStreamCancellationProbe,
	createStreamsImplementations,
} from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

const cancellationProbe = createStreamCancellationProbe();

runStreamsSuite({
	...createHonoAdapter(createStreamsImplementations({ cancellationProbe })),
	cancellationProbe,
});
