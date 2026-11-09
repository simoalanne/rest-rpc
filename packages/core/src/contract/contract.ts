import type { RouteDefinition } from "./routeDefinition.ts";

/**
 * A route definition or nested object tree of route definitions.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder}
 */
export type Contract =
	| { readonly "~restrpc": RouteDefinition }
	| { [key: string]: Contract };
