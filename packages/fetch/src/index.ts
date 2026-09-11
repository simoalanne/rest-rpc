export { createFetchResponse } from "./response.ts";
import {
	implement as serverImplement,
	serverFirstRoute,
} from "@rest-rpc/server";
import type {
	ImplementationBuildersFor,
	ServerContract,
	ServerRouteFactory,
} from "@rest-rpc/server";

/** Application context used by Fetch route handlers by default. */
export interface DefaultContext {}

/** Starts a server-first route builder chain */
export const route = serverFirstRoute as unknown as ServerRouteFactory<
	Record<never, never>,
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
} from "@rest-rpc/server";

export {
	RequestValidationError,
	ResponseValidationError,
} from "@rest-rpc/server";

export { defaultBodyParser } from "./request.ts";
export type { FetchBodyParser } from "./request.ts";
export { createRouteHandler } from "./handler.ts";
export type {
	CreateFetchHandlerOptions,
	RequestValidationErrorHandler,
	ResponseValidationErrorHandler,
} from "./handler.ts";
