import { implement } from "@rest-rpc/server";
import { errorHandlersContract } from "./contract.ts";
import type { ErrorHandlerState } from "./state.ts";

export const createErrorHandlersImplementations = (
	state: ErrorHandlerState,
) => {
	const implementor = implement(errorHandlersContract);

	return {
		validation: implementor.validation.handler(() => ({
			status: 200,
			body: { reached: true as const },
		})),
		unhandled: implementor.unhandled.handler(() => {
			throw new Error("boom from integration handler");
		}),
		hookState: implementor.hookState.handler(() => ({
			status: 200,
			body: {
				validationErrors: state.validationErrors,
				unhandledErrors: state.unhandledErrors,
			},
		})),
	};
};
