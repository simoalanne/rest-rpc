import { createFastifyAdapter } from "../harness/fastify.ts";
import { createResponseLifecycleImplementations } from "./handlers.ts";
import { runResponseMiddlewareHeadersSuite } from "./suite.ts";

runResponseMiddlewareHeadersSuite(
	createFastifyAdapter(createResponseLifecycleImplementations(), {
		configureApp: (app) => {
			app.addHook("onRequest", (_request, reply, done) => {
				reply.header("x-fastify-middleware", "set");
				done();
			});
		},
	}),
	{ "x-fastify-middleware": "set" },
);
