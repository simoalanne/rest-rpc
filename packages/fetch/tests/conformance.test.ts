import { compileRoutes, createCatchAllHandler } from "@rest-rpc/fetch";
import { describeAdapterConformance } from "../../server/tests/adapterSuite.ts";
import { withFetchServer } from "../../../tests/httpServer.ts";

describeAdapterConformance("fetch", {
	capabilities: {
		requestBodyLimit: true,
	},
	serve: (routes, options, run) => {
		const handler = createCatchAllHandler(
			compileRoutes(routes, {
				requestBodyLimit: options.requestBodyLimit,
				...(options.customValidationHandlers && {
					requestValidationErrorHandler: () =>
						Response.json({ handled: "request" }, { status: 422 }),
					responseValidationErrorHandler: () =>
						Response.json({ handled: "response" }, { status: 502 }),
				}),
			}),
		);
		return withFetchServer(
			async (request) =>
				(await handler(request)).response ??
				new Response(null, { status: 404 }),
			run,
		);
	},
});
