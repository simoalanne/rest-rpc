import type { RouteTree } from "./contract.ts";
import { resolveRoutePath } from "./path.ts";
import { mapContractRoutes } from "./traversal.ts";

/**
 * Extracts the minimal JSON-compatible client contract from a route tree.
 *
 * @remarks Keeps only each route's method, resolved path, request body media
 * types, declared response statuses and media types, and the status of each
 * declared error code. The request body keeps the declaration shape with empty
 * schema lists, and response media types keep `null` schemas. Schemas,
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
export function extractContract<const TRoutes extends RouteTree>(
	routes: TRoutes,
): TRoutes {
	return mapContractRoutes(routes, (route, routePath) => ({
		"~restrpc": {
			method: route.method,
			path: resolveRoutePath(route, routePath),
			...(route.request?.body && {
				request: {
					body: Object.fromEntries(
						Object.keys(route.request.body).map((mediaType) => [mediaType, []]),
					),
				},
			}),
			// Media types keep a `null` schema, so the client checks statuses and
			// content types without validating bodies.
			...(Object.keys(route.responses ?? {}).length > 0 && {
				responses: Object.fromEntries(
					Object.entries(route.responses).map(([status, { content }]) => [
						status,
						content
							? {
									content: Object.fromEntries(
										Object.keys(content).map((mediaType) => [mediaType, null]),
									),
								}
							: {},
					]),
				),
			}),
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
