import type { HttpRouteDeclaration } from "./httpRouteBuilder.ts";
import type { SseRouteDeclaration } from "./sseRouteBuilder.ts";
import type { WebSocketRouteDeclaration } from "./websocketRouteBuilder.ts";

/**
 * Any complete route declaration in a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration}
 */
export type RouteDeclaration =
	| HttpRouteDeclaration
	| SseRouteDeclaration
	| WebSocketRouteDeclaration;

/**
 * A route declaration or nested object tree of route declarations.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration}
 */
export type Contract = RouteDeclaration | { [key: string]: Contract };
