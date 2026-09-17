import { createFetchAdapter } from "../harness/fetch.ts";
import { createResponseValidationImplementations } from "./handlers.ts";
import { runResponseValidationSuite } from "./suite.ts";

runResponseValidationSuite(
	createFetchAdapter(createResponseValidationImplementations(), {
		createHandlerOptions: {
			responseValidationErrorHandler: (_error, request) =>
				Response.json(
					{
						code: "INVALID_RESPONSE",
						path: new URL(request.url).pathname,
					},
					{
						status: 500,
						headers: { "x-error-handler": "response-validation" },
					},
				),
		},
		handleError: (error) =>
			Response.json(
				{
					code: "TEAPOT",
					message: error instanceof Error ? error.message : "unknown error",
				},
				{ status: 418 },
			),
	}),
);
