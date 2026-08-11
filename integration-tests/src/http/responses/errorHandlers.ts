import type { ServerErrorHandlers } from "@rest-rpc/server";

export const responseErrorHandlers: ServerErrorHandlers<
	Record<string, unknown>
> = {
	onUnhandledError: ({ error, route }) => {
		if (route.path === "/responses/undeclared") {
			return {
				status: 418,
				body: {
					code: "TEAPOT",
					message: error instanceof Error ? error.message : "unknown error",
				},
			};
		}

		return {
			status: 500,
			headers: {
				"x-error-handler": "response-validation",
			},
			body: {
				code: "INVALID_RESPONSE",
				path: route.path,
			},
		};
	},
};
