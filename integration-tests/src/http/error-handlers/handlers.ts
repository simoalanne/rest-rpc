import { implement } from "@rest-rpc/server";
import { errorHandlersContract } from "./contract.ts";
import type { ErrorHandlerState } from "./state.ts";

export const createErrorHandlersImplementations = (
	state: ErrorHandlerState,
) => {
	const implementer = implement(errorHandlersContract);

	return {
		validation: implementer.validation.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		unhandled: implementer.unhandled.handler(() => {
			throw new Error("boom from integration handler");
		}),
		hookState: implementer.hookState.handler(() => ({
			status: 200,
			body: {
				validationErrors: state.validationErrors,
				unhandledErrors: state.unhandledErrors,
			},
		})),
	};
};
