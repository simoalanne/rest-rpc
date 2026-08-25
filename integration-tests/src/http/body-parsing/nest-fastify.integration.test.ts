import { createNestAdapter } from "../harness/nest.ts";
import { bodyParsingContract } from "./contract.ts";
import { createBodyParsingHandlers } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

type FastifyParserDone = (error: Error | null, body?: unknown) => void;

runBodyParsingSuite(
	createNestAdapter(bodyParsingContract, createBodyParsingHandlers(), {
		configureFastify: (app) => {
			app.addContentTypeParser(
				"text/markdown",
				{ parseAs: "string" },
				(_request: unknown, body: string | Buffer, done: FastifyParserDone) =>
					done(null, body),
			);
			app.addContentTypeParser(
				"application/xml",
				{ parseAs: "string" },
				(_request: unknown, body: string | Buffer, done: FastifyParserDone) =>
					done(null, body),
			);
			app.addContentTypeParser(
				"application/x-www-form-urlencoded",
				{ parseAs: "string" },
				(_request: unknown, body: string | Buffer, done: FastifyParserDone) =>
					done(null, new URLSearchParams(String(body))),
			);
			app.addContentTypeParser(
				"application/octet-stream",
				{ parseAs: "buffer" },
				(_request: unknown, body: string | Buffer, done: FastifyParserDone) =>
					done(null, body),
			);
		},
		platform: "fastify",
	}),
);
