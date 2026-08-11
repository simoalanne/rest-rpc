import type { ServerErrorHandlers } from "@rest-rpc/server";

export type ErrorHandlerState = {
	validationErrors: number;
	unhandledErrors: number;
};

export const createErrorHandlerState = (): ErrorHandlerState => ({
	validationErrors: 0,
	unhandledErrors: 0,
});

export const createErrorHandlers = (
	state: ErrorHandlerState,
): ServerErrorHandlers<Record<string, unknown>> => ({
	onRequestValidationError: ({ issues, route }) => {
		state.validationErrors += 1;

		return {
			status: 422,
			headers: {
				"x-error-handler": "request-validation",
			},
			body: {
				code: "VALIDATION_ERROR",
				issueCount: issues.length,
				path: route.path,
			},
		};
	},
	onUnhandledError: ({ error, route }) => {
		state.unhandledErrors += 1;

		return {
			status: 503,
			headers: {
				"x-error-handler": "unhandled",
			},
			body: {
				code: "UNHANDLED_ERROR",
				message: error instanceof Error ? error.message : "unknown error",
				path: route.path,
			},
		};
	},
});
