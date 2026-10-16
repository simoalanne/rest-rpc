import {
	contractRouteEntries,
	isPathParamSegment,
	isRouteLeaf,
	toColonPath,
	type AbsolutePath,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";
import { addRoute, createRouter, findRoute } from "rou3";
import type { RuntimeRouteHandler } from "./routeBuilder.types.ts";

const splitPath = (path: string) => path.split("/").filter(Boolean);

const joinPaths = (
	prefix: AbsolutePath | undefined,
	path: AbsolutePath,
): AbsolutePath =>
	`/${[...splitPath(prefix ?? ""), ...splitPath(path)].join("/")}`;

const compareRouteSpecificity = (
	left: RouteDeclaration & { path: string },
	right: RouteDeclaration & { path: string },
) => {
	const leftSegments = splitPath(left.path);
	const rightSegments = splitPath(right.path);
	const maxLength = Math.max(leftSegments.length, rightSegments.length);

	for (let index = 0; index < maxLength; index += 1) {
		const leftSegment = leftSegments[index];
		const rightSegment = rightSegments[index];

		if (leftSegment === rightSegment) continue;
		if (leftSegment === undefined) return 1;
		if (rightSegment === undefined) return -1;

		const leftIsParam = isPathParamSegment(leftSegment);
		const rightIsParam = isPathParamSegment(rightSegment);

		if (leftIsParam !== rightIsParam) {
			return leftIsParam ? 1 : -1;
		}

		return leftSegment.localeCompare(rightSegment);
	}

	return left.method.localeCompare(right.method);
};

/** A flattened route declaration with its handler and middleware. */
export type RuntimeImplementation = {
	route: RouteDeclaration & { path: string };
	handler: (...args: never[]) => unknown;
	middleware?: readonly RuntimeRouteHandler[];
};

/** A route leaf whose declaration has a handler attached. */
export type ImplementedRoute = {
	readonly "~restrpc": RouteDeclaration & {
		readonly handler: (...args: never[]) => unknown;
		readonly middleware?: readonly RuntimeRouteHandler[];
	};
};

/** An implementation or nested implementation tree consumed at runtime. */
export type RuntimeImplementationTree =
	| ImplementedRoute
	| { readonly [key: string]: RuntimeImplementationTree };

/** Detects a route leaf whose declaration has a handler attached. */
export function isImplementedRoute(value: unknown): value is ImplementedRoute {
	return (
		isRouteLeaf(value) &&
		typeof value["~restrpc"] === "object" &&
		value["~restrpc"] !== null &&
		"handler" in value["~restrpc"]
	);
}

/** Flattens and orders an implementation tree for route registration. */
export function flattenRouteImplementations(
	implementation: RuntimeImplementationTree,
): RuntimeImplementation[] {
	return [...contractRouteEntries(implementation)]
		.map(({ route: entry }) => {
			const { handler, middleware, ...route } =
				entry as ImplementedRoute["~restrpc"] & {
					path: string;
				};
			return { route, handler, middleware };
		})
		.sort((left, right) => compareRouteSpecificity(left.route, right.route));
}

/** A matched route implementation and its decoded URL parameters. */
export type RouteMatch = {
	implementation: RuntimeImplementation;
	params: Record<string, string>;
};

/**
 * Compiles route implementations into a method and path matcher.
 *
 * @remarks Matching follows rou3 semantics. Params are percent-decoded to
 * mirror the client, which encodes them.
 */
export function createRouteMatcher(
	implementations: RuntimeImplementationTree,
	prefix?: AbsolutePath,
) {
	const router = createRouter<RuntimeImplementation>();
	for (const implementation of flattenRouteImplementations(implementations)) {
		addRoute(
			router,
			implementation.route.method,
			toColonPath(joinPaths(prefix, implementation.route.path as AbsolutePath)),
			implementation,
		);
	}

	return (request: {
		path: string;
		method: string;
	}): RouteMatch | undefined => {
		const match = findRoute(router, request.method, request.path);
		if (!match) return undefined;

		const params: Record<string, string> = {};
		for (const [key, value] of Object.entries(match.params ?? {})) {
			params[key] = decodeURIComponent(value);
		}
		return { implementation: match.data, params };
	};
}
