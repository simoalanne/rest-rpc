import type { HttpRouteDeclaration } from "./httpRouteBuilder.ts";
import type { AnyShorthandRouteDeclaration } from "./shorthandRouteBuilder.ts";

/**
 * Any complete route declaration in a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration}
 */
export type RouteDeclaration = HttpRouteDeclaration;

/**
 * A route declaration or nested object tree of route declarations.
 *
 * @see {@link https://rest-rpc.dev/docs/contract/declaration}
 */
export type Contract =
	| RouteDeclaration
	| AnyShorthandRouteDeclaration
	| { [key: string]: Contract };
