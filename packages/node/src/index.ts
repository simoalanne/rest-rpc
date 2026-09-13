import type { IncomingMessage, ServerResponse } from "node:http";
import type { Contract } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type ContractImplementor,
	type ServerRouteBuilder,
} from "@rest-rpc/server";

type NodeHandlerFields = {
	req: IncomingMessage;
	res: ServerResponse;
	signal: AbortSignal;
};

/** Result of dispatching a request through the general Node HTTP handler. */
export type NodeRouteHandlerResult = { matched: boolean };

/** Application context used by Node route handlers by default. */
export interface DefaultContext {}

/** Starts a Node server-first route builder chain. */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	NodeHandlerFields,
	DefaultContext
>;

/** Exposes Node handler attachment on every route in a core contract. */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, NodeHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		NodeHandlerFields,
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
	CreateNodeHandlerOptions,
	RequestValidationErrorHandler,
	ResponseValidationErrorHandler,
} from "./handler.ts";
export { createRequestSignal } from "./lifecycle.ts";
export { defaultBodyParser, parseRequestTarget } from "./request.ts";
export type { NodeBodyParser } from "./request.ts";
export {
	createNodeResponseStream,
	writeNodeResponse,
	writeStreamResponse,
} from "./response.ts";
