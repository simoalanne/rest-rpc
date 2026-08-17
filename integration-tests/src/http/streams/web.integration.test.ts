import { createWebAdapter } from "../harness/web.ts";
import {
	createStreamCancellationProbe,
	createStreamsImplementations,
} from "./handlers.ts";
import { runStreamsSuite } from "./suite.ts";

const cancellationProbe = createStreamCancellationProbe();

runStreamsSuite({
	...createWebAdapter(createStreamsImplementations({ cancellationProbe })),
	cancellationProbe,
});
