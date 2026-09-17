import { createNestAdapter } from "../harness/nest.ts";
import { requestCodecErrorsContract } from "./contract.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";
import { runRequestCodecErrorsSuite } from "./suite.ts";

runRequestCodecErrorsSuite(
	createNestAdapter(
		requestCodecErrorsContract,
		createRequestCodecErrorsImplementations(),
		{
			platform: "fastify",
			configureFastify: (app) => {
				// Let unsupported media types reach the route's acceptance check.
				app.addContentTypeParser(
					["application/xml", "application/octet-stream"],
					{ parseAs: "buffer" },
					(_request, body, done) => done(null, body),
				);
			},
		},
	),
);
