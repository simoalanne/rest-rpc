import type { ServerErrorResponse } from "./errorHandlers.ts";

export const createRequestParsingErrorResponse = (
	message = "Request could not be parsed.",
): ServerErrorResponse => ({
	status: 400,
	body: {
		message:
			"Request validation failed. Check the validationErrors field for details.",
		validationErrors: [{ message }],
	},
});
