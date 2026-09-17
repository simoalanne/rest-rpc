import { createFastifyAdapter } from "../harness/fastify.ts";
import { createRequestCodecErrorsImplementations } from "./handlers.ts";
import { runRequestCodecErrorsSuite } from "./suite.ts";

runRequestCodecErrorsSuite(
	createFastifyAdapter(createRequestCodecErrorsImplementations(), {
		configureApp: (app) => {
			// Let unsupported media types reach the route's acceptance check.
			app.addContentTypeParser(
				["application/xml", "application/octet-stream"],
				{ parseAs: "buffer" },
				(_request, body, done) => done(null, body),
			);
		},
	}),
);
