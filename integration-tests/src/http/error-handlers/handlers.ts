import { implement, RouteResponseError } from "@rest-rpc/server";
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
		contractResponse: implementor.contractResponse.handler(() => {
			throw new RouteResponseError(errorHandlersContract.contractResponse, {
				status: 409,
				body: {
					code: "conflict",
					source: "contract-response-error",
				},
			});
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
