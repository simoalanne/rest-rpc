import type { ServerErrorResponse } from "./errorHandlers.ts";

/**
 * Creates the default 400 response for request body parsing failures.
 *
 * @see {@link https://rest-rpc.dev/docs/server/web#body-parsing}
 */
export function createRequestParsingErrorResponse(
	message = "Request could not be parsed.",
): ServerErrorResponse {
	return {
		status: 400,
		body: {
			message:
				"Request validation failed. Check the validationErrors field for details.",
			validationErrors: [{ message }],
		},
	};
}
