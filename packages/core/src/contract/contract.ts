import type { RouteDeclaration } from "./routeDeclaration.ts";

type CompleteRouteDeclaration = RouteDeclaration & {
	readonly output: NonNullable<RouteDeclaration["output"]>;
};

/**
 * Any complete route declaration in a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder}
 */
export type { RouteDeclaration } from "./routeDeclaration.ts";

/**
 * A route declaration or nested object tree of route declarations.
 *
 * @see {@link https://rest-rpc.dev/docs/route-builder}
 */
export type Contract =
	| { readonly "~restrpc": CompleteRouteDeclaration }
	| { [key: string]: Contract };

/** A route, including one declared without `.handler()`, or a nested object tree of routes. */
export type RouteTree =
	| { readonly "~restrpc": RouteDeclaration }
	| { [key: string]: RouteTree };
