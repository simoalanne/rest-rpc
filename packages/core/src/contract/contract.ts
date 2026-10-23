import type { RouteDeclaration } from "./routeDeclaration.ts";

/**
 * A route declaration or nested object tree of route declarations.
 *
 * @see {@link https://rest-rpc.vercel.app/docs/route-builder}
 */
export type Contract =
	| { readonly "~restrpc": RouteDeclaration }
	| { [key: string]: Contract };
