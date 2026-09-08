import { createFetchAdapter } from "../harness/fetch.ts";
import { createErrorHandlerState } from "./state.ts";
import { createErrorHandlersImplementations } from "./handlers.ts";
import { runErrorHandlersSuite } from "./suite.ts";

const state = createErrorHandlerState();

runErrorHandlersSuite(
	createFetchAdapter(createErrorHandlersImplementations(state), {
		createHandlerOptions: {
			requestValidationErrorHandler: (error, request) => {
				state.validationErrors += 1;
				const issueCount = Object.values(error.issues).reduce(
					(count, issues) => count + issues.length,
					0,
				);

				return Response.json(
					{
						code: "VALIDATION_ERROR",
						issueCount,
						path: new URL(request.url).pathname,
					},
					{
						status: 422,
						headers: { "x-error-handler": "request-validation" },
					},
				);
			},
		},
		handleError: (error, request) => {
			state.unhandledErrors += 1;
			return Response.json(
				{
					code: "UNHANDLED_ERROR",
					message: error instanceof Error ? error.message : "unknown error",
					path: new URL(request.url).pathname,
				},
				{
					status: 503,
					headers: { "x-error-handler": "unhandled" },
				},
			);
		},
	}),
);
