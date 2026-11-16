import type { Contract } from "./contract.ts";
import { resolveRoutePath } from "./path.ts";
import { mapContractRoutes } from "./traversal.ts";

/**
 * Extracts the minimal JSON-compatible client contract from a route tree.
 *
 * @remarks Keeps only each route's method, resolved path, whether it has a
 * request body, its defined response statuses and whether each has a body or
 * a stream, and the status of each defined error code. The request body is an
 * empty schema list, and response bodies keep `null` schemas. Schemas,
 * metadata, and handlers are left out, so the result can be serialized and
 * shipped to a client without server code.
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
export function extractContract<const TRoutes extends Contract>(
	routes: TRoutes,
): TRoutes {
	return mapContractRoutes(routes, (route, routePath) => ({
		"~restrpc": {
			method: route.method,
			path: resolveRoutePath(route, routePath),
			...(route.request?.body && { request: { body: [] } }),
			// A `null` schema keeps whether a status has a body or a stream, so the
			// client checks them without validating bodies.
			responses: Object.fromEntries(
				Object.entries(route.responses).map(([status, response]) => [
					status,
					{
						...(response.body && { body: null }),
						...(response.sse && { sse: null }),
					},
				]),
			),
			...(route.errors && {
				errors: Object.fromEntries(
					Object.entries(route.errors).map(([code, { status }]) => [
						code,
						{ status },
					]),
				),
			}),
		},
	})) as TRoutes;
}
