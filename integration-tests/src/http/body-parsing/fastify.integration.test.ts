import { registerRoutes } from "@rest-rpc/fastify";
import Fastify from "fastify";
import { createBodyParsingImplementations } from "./handlers.ts";
import { runBodyParsingSuite } from "./suite.ts";

runBodyParsingSuite({
	name: "fastify",
	start: async () => {
		const app = Fastify();

		app.addContentTypeParser(
			"text/plain",
			{ parseAs: "string" },
			(_request, body, done) => done(null, body),
		);
		app.addContentTypeParser(
			"application/octet-stream",
			{ parseAs: "buffer" },
			(_request, body, done) => done(null, body),
		);

		registerRoutes(app, createBodyParsingImplementations());

		const origin = await app.listen({ host: "127.0.0.1", port: 0 });

		return {
			origin,
			close: () => app.close(),
		};
	},
});
