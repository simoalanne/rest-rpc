import express from "express";
import { registerRoutes } from "@rest-rpc/express";
import { describeAdapterConformance } from "../../server/tests/adapterSuite.ts";
import { withHttpServer } from "../../../tests/httpServer.ts";

describeAdapterConformance("express", {
	capabilities: {
		requestBodyLimit: false,
	},
	serve: (routes, options, run) => {
		const app = express();
		app.use(express.json(), express.text());
		registerRoutes(
			app,
			routes,
			options.customValidationHandlers
				? {
						requestValidationErrorHandler: (_error, _req, res) =>
							res.status(422).json({ handled: "request" }),
						responseValidationErrorHandler: (_error, _req, res) =>
							res.status(502).json({ handled: "response" }),
					}
				: {},
		);
		return withHttpServer(app, run);
	},
});
