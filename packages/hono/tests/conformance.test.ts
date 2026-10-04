import { Hono } from "hono";
import { registerRoutes } from "@rest-rpc/hono";
import { describeAdapterConformance } from "../../server/tests/adapterSuite.ts";
import { withFetchServer } from "../../../tests/httpServer.ts";

describeAdapterConformance("hono", {
	capabilities: {
		requestBodyLimit: true,
	},
	serve: (routes, options, run) => {
		const app = new Hono();
		registerRoutes(app, routes, {
			requestBodyLimit: options.requestBodyLimit,
			...(options.customValidationHandlers && {
				requestValidationErrorHandler: (_error, c) =>
					c.json({ handled: "request" }, 422),
				responseValidationErrorHandler: (_error, c) =>
					c.json({ handled: "response" }, 502),
			}),
		});
		return withFetchServer((request) => app.fetch(request), run);
	},
});
