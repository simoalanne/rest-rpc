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

/**
 * Application context available to Fetch route handlers.
 *
 * @remarks Augment this interface to define the context accepted by the
 * catch-all handler and received by every route handler.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch#framework-context}
 */
export interface DefaultContext {}

/**
 * Entry point for declaring server-first routes handled by the Fetch runtime.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`.
 *
 * @see {@link https://rest-rpc.dev/docs/server-first/server}
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	FetchHandlerFields,
	DefaultContext
>;

/**
 * Creates typed Fetch handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/fetch}
 */
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
