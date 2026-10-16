import { compileRoutes, createCatchAllHandler } from "@rest-rpc/node";
import { describeAdapterConformance } from "../../server/tests/adapterSuite.ts";
import { withHttpServer } from "../../../tests/httpServer.ts";

describeAdapterConformance("node", {
	capabilities: {
		requestBodyLimit: true,
	},
	serve: (routes, options, run) => {
		const handler = createCatchAllHandler(
			compileRoutes(routes, {
				requestBodyLimit: options.requestBodyLimit,
				...(options.customValidationHandlers && {
					requestValidationErrorHandler: (_error, _req, res) => {
						res.statusCode = 422;
						res.end(JSON.stringify({ handled: "request" }));
					},
					responseValidationErrorHandler: (_error, _req, res) => {
						res.statusCode = 502;
						res.end(JSON.stringify({ handled: "response" }));
					},
				}),
			}),
		);
		return withHttpServer(async (req, res) => {
			try {
				if (!(await handler(req, res)).matched) {
					res.statusCode = 404;
					res.end();
				}
			} catch {
				res.destroy();
			}
		}, run);
	},
});
