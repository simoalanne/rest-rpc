import type { RouteTree } from "./contract.ts";
import { resolveRoutePath } from "./path.ts";
import { mapContractRoutes } from "./traversal.ts";

/**
 * Extracts the minimal JSON-compatible client contract from a route tree.
 *
 * @remarks Keeps only each route's method, resolved path, and request body
 * content type. Schemas, responses, metadata, and handlers are left out, so
 * the result can be serialized and shipped to a client without server code.
 * The return type keeps the route tree type for client inference.
 *
 * Extraction runs the module that defines the routes, so call it at build
 * time, for example from a script or a bundler macro.
 *
 * @example
 * ```ts
 * import { extractContract } from "@rest-rpc/core";
 * import { routes } from "./server/routes";
 *
 * export const api = extractContract(routes);
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/contract-extraction}
 */
export function extractContract<const TRoutes extends RouteTree>(
	routes: TRoutes,
): TRoutes {
	return mapContractRoutes(routes, (route, routePath) => ({
		"~restrpc": {
			method: route.method,
			path: resolveRoutePath(route, routePath),
			request: {
				contentType: route.request?.contentType,
			},
		},
	})) as TRoutes;
}
