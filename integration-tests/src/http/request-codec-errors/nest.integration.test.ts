import { createNestAdapter } from "../harness/nest.ts";
import { requestCodecErrorsContract } from "./contract.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";
import { runRequestCodecErrorsSuite } from "./suite.ts";

runRequestCodecErrorsSuite(
	createNestAdapter(
		requestCodecErrorsContract,
		createRequestCodecErrorsImplementations(),
	),
);
