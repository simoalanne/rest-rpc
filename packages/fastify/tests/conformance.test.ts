import Fastify from "fastify";
import { registerRoutes } from "@rest-rpc/fastify";
import { describeAdapterConformance } from "../../server/tests/adapterSuite.ts";

describeAdapterConformance("fastify", {
	capabilities: {
		requestBodyLimit: false,
	},
	serve: async (routes, options, run) => {
		const app = Fastify();
		registerRoutes(
			app,
			routes,
			options.customValidationHandlers
				? {
						requestValidationErrorHandler: (_error, _req, reply) =>
							reply.status(422).send({ handled: "request" }),
						responseValidationErrorHandler: (_error, _req, reply) =>
							reply.status(502).send({ handled: "response" }),
					}
				: {},
		);
		try {
			await run(await app.listen({ port: 0, host: "127.0.0.1" }));
		} finally {
			await app.close();
		}
	},
});
