import type { Contract } from "./contract.ts";
import type { RouteDefinition } from "./routeDefinition.ts";
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
 * import { router } from "./router.ts";
 *
 * export function getContract() {
 * 	return extractContract(router);
 * }
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/contract-extraction}
 */
export function extractContract<const TRouter extends Contract>(
	router: TRouter,
): TRouter {
	return mapContractRoutes(router, (route, routePath) => ({
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
	})) as TRouter;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isExtractedRoute = (value: unknown): value is RouteDefinition =>
	isObject(value) &&
	typeof value.method === "string" &&
	typeof value.path === "string" &&
	isObject(value.responses);

const assertExtractedContract = (value: unknown, keys: string[]): void => {
	const at = keys.length ? ` at "${keys.join(".")}"` : "";
	if (!isObject(value)) {
		throw new TypeError(`Expected an extracted contract${at}.`);
	}
	if ("~restrpc" in value) {
		if (!isExtractedRoute(value["~restrpc"])) {
			throw new TypeError(
				`Expected an extracted route with a method, path and responses${at}.`,
			);
		}
		return;
	}
	for (const [key, child] of Object.entries(value)) {
		assertExtractedContract(child, [...keys, key]);
	}
};

/**
 * Types a contract that {@link extractContract} wrote to JSON as the route
 * tree it was extracted from, to create a client from.
 *
 * @remarks Checks that the value has the shape of an extracted contract,
 * routes with a method, path and responses, and throws a `TypeError` when it
 * doesn't. Pass the route tree's type, such as `typeof router`. A contract
 * created with a bundler macro is already typed and needs no conversion.
 *
 * @example
 * ```ts
 * import { contractFromJson, createClient } from "@rest-rpc/core";
 * import type { router } from "./router";
 * import json from "./contract.json";
 *
 * export const client = createClient(contractFromJson<typeof router>(json));
 * ```
 *
 * @see {@link https://rest-rpc.vercel.app/docs/client/contract-extraction#extract-routes-without-a-macro}
 */
export function contractFromJson<TRouter extends Contract>(
	json: unknown,
): TRouter {
	assertExtractedContract(json, []);
	return json as TRouter;
}
