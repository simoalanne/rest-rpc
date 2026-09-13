import type { Contract } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type ContractImplementor,
	type ServerRouteBuilder,
} from "@rest-rpc/server";

type FetchHandlerFields = {
	request: Request;
	signal: AbortSignal;
};

/** Application context used by Fetch route handlers by default. */
export interface DefaultContext {}

/** Starts a Fetch server-first route builder chain. */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	FetchHandlerFields,
	DefaultContext
>;

/** Exposes Fetch handler attachment on every route in a core contract. */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, FetchHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		FetchHandlerFields,
		DefaultContext
	>;
}

export type {
	ImplicitResponseEnvelope,
	ImplicitResponseKind,
	InferredRouteResponse,
	ServerFirstResponseKind,
	ServerFirstRouteResponseKind,
} from "@rest-rpc/server";
export {
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";
export { createRouteHandler } from "./handler.ts";
export type {
	CreateFetchHandlerOptions,
	RequestValidationErrorHandler,
	ResponseValidationErrorHandler,
} from "./handler.ts";
export { defaultBodyParser } from "./request.ts";
export type { FetchBodyParser } from "./request.ts";
export { createFetchResponse } from "./response.ts";
