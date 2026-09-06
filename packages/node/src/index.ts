/** Result of dispatching a request through the general Node HTTP handler. */
export type NodeRouteHandlerResult = { matched: boolean };
import {
	implement as serverImplement,
	serverFirstRoute,
} from "@rest-rpc/server";
import type {
	ImplementationBuildersFor,
	ServerContract,
	ServerRouteFactory,
} from "@rest-rpc/server";

/** Application context used by Node route handlers by default. */
export interface DefaultContext {}

/** Starts a server-first route builder chain */
export const route = serverFirstRoute as ServerRouteFactory<
	{ flattenRequestKeys: true },
	DefaultContext
>;

/** Converts a contract-first route or route tree into a server route builder */
export function implement<const TNode extends ServerContract>(
	contract: TNode,
): ImplementationBuildersFor<TNode, DefaultContext> {
	return serverImplement(contract) as ImplementationBuildersFor<
		TNode,
		DefaultContext
	>;
}

export type {
	Implement,
	ImplicitResponseEnvelope,
	ImplicitResponseKind,
	InferredRouteResponse,
	ImplementationBuildersFor,
	ServerImplementationTree,
	ServerFirstResponseKind,
	ServerFirstRouteResponseKind,
	ServerHttpBuilderExtension,
	ServerRouteFactory,
	ServerRouteImplementation,
	ServerSseBuilderExtension,
} from "@rest-rpc/server";
export { createRouteHandler } from "./handler.ts";
export type { CreateNodeHandlerOptions } from "./handler.ts";
export { createRequestSignal } from "./lifecycle.ts";
export { defaultParseBody, parseRequestTarget } from "./request.ts";
export type { NodeRouteParseBody, NodeRouteParseBodyInput } from "./request.ts";
export { writeNodeResponse, writeStreamResponse } from "./response.ts";
