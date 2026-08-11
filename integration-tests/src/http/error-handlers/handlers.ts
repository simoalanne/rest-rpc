import {
	ContractResponseError,
	type ImplementationShape,
	router,
} from "@rest-rpc/server";
import {
	type ErrorHandlersContract,
	errorHandlersContract,
} from "./contract.ts";
import type { ErrorHandlerState } from "./errorHandlers.ts";

export type ErrorHandlersHandlers = ImplementationShape<ErrorHandlersContract>;

export const createErrorHandlersHandlers = (
	state: ErrorHandlerState,
): ErrorHandlersHandlers => ({
	validation: () => ({ reached: true as const }),
	unhandled: () => {
		throw new Error("boom from integration handler");
	},
	contractResponse: () => {
		throw new ContractResponseError(errorHandlersContract.contractResponse, {
			status: 409,
			body: {
				code: "conflict",
				source: "contract-response-error",
			},
		});
	},
	hookState: () => ({
		validationErrors: state.validationErrors,
		unhandledErrors: state.unhandledErrors,
	}),
});

export const createErrorHandlersImplementations = (state: ErrorHandlerState) =>
	router(errorHandlersContract, createErrorHandlersHandlers(state));
