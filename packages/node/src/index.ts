import type { IncomingMessage, ServerResponse } from "node:http";
import type { Contract } from "@rest-rpc/core/contract";
import {
	implement as serverImplement,
	serverFirstRoute,
	type ContractImplementor,
	type ServerRouteBuilder,
} from "@rest-rpc/server";

/**
 * The default application context shared by handlers and middleware. Augment this interface globally.
 * Defaults to an empty object if not extended.
 *
 * @default {}
 */
export interface DefaultContext {}

/**
 * Native request available to Node HTTP adapter handlers and middleware. Augment this interface globally.
 * Must extend `IncomingMessage` to be compatible with Node HTTP server.
 *
 * @default IncomingMessage
 */
export interface DefaultRequest extends IncomingMessage {}

type NodeHandlerFields = {
	req: DefaultRequest;
	res: ServerResponse;
	signal: AbortSignal;
};

/**
 * Indicates whether the Node HTTP handler dispatched a request to a rest-rpc route.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export type NodeRouteHandlerResult = { matched: boolean };

/**
 * Entry point for declaring routes with handlers for Node HTTP.
 *
 * @remarks Responses are inferred from the handler unless they are declared
 * before `.handler()`.
 *
 * @see {@link https://rest-rpc.dev/docs/quickstart#define-and-register-routes}
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export const route = serverFirstRoute as unknown as ServerRouteBuilder<
	NodeHandlerFields,
	DefaultContext
>;

/**
 * Creates typed Node HTTP handler builders for every route in a shared contract.
 *
 * @see {@link https://rest-rpc.dev/docs/server/node}
 */
export function implement<const TContract extends Contract>(
	contract: TContract,
): ContractImplementor<TContract, NodeHandlerFields, DefaultContext> {
	return serverImplement(contract) as unknown as ContractImplementor<
		TContract,
		NodeHandlerFields,
		DefaultContext
	>;
}

export { type } from "@rest-rpc/core";
export type {
	Context,
	InferServerRequest,
	InferServerResponse,
	ImplicitResponseEnvelope,
	ImplicitResponseKind,
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
export { parseRequestTarget } from "./request.ts";
export {
	createNodeResponseStream,
	writeNodeResponse,
	writeStreamResponse,
} from "./response.ts";

export { nodeBodyCodecs } from "./codecs.ts";
export type {
	CreateOpenApiDocumentOptions,
	OpenApiDocument,
	BodyCodec,
} from "@rest-rpc/core";
export { createOpenApiDocument } from "@rest-rpc/core";
export { sse } from "@rest-rpc/server";
export type { SseEvent } from "@rest-rpc/core";
