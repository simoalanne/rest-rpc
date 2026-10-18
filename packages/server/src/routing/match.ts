import {
	contractRouteEntries,
	getPathParamSegmentName,
	isPathParamSegment,
	isRouteLeaf,
	toColonPath,
	toOpenApiPath,
	type AbsolutePath,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";
import { addRoute, createRouter, findRoute } from "rou3";
import type { RuntimeRouteHandler } from "../builder/routeBuilder.types.ts";

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

/** Param marker style used in compiled route paths. */
export type ParamSyntax = "colon" | "braces";

/**
 * Joins a prefix and route path and optionally rewrites param markers.
 *
 * @remarks Without `paramSyntax` the declared markers are kept as written.
 */
export function resolveImplementationPath(
	path: string,
	prefix?: AbsolutePath,
	paramSyntax?: ParamSyntax,
): string {
	const joined = joinPaths(prefix, path as AbsolutePath);
	if (paramSyntax === "colon") return toColonPath(joined);
	if (paramSyntax === "braces") return toOpenApiPath(joined);
	return joined;
}

/**
 * Compiles routes into a method and path matcher.
 *
 * @remarks Matching follows rou3 semantics.
 */
export function createRouteMatcher<
	TRoute extends { readonly method: string; readonly path: string },
>(
	routes: readonly TRoute[],
): (method: string, pathname: string) => TRoute | undefined {
	const router = createRouter<TRoute>();
	for (const route of routes) {
		addRoute(router, route.method, toColonPath(route.path), route);
	}

	return (method, pathname) =>
		findRoute(router, method, pathname, { params: false })?.data;
}

const pathParamNames = (path: string) =>
	splitPath(path).flatMap((segment) => getPathParamSegmentName(segment) ?? []);

/**
 * Reads the percent-decoded params of `path` from a request `pathname`.
 *
 * @remarks `pathname` may have extra leading segments, such as a mount prefix
 * the router did not strip, so params are aligned to the end of `pathname`.
 * Throws when `pathname` has fewer segments than `path`.
 */
export function readPathParams(
	path: string,
	pathname: string,
): Record<string, string> {
	const segments = splitPath(path);
	const pathnameSegments = splitPath(pathname);
	const leadingSegments = pathnameSegments.length - segments.length;
	if (leadingSegments < 0) {
		throw new Error(
			`Request path "${pathname}" has fewer segments than route path "${path}".`,
		);
	}

	const params: Record<string, string> = {};
	for (const [index, segment] of segments.entries()) {
		const name = getPathParamSegmentName(segment);
		if (name === undefined) continue;
		params[name] = decodeURIComponent(
			pathnameSegments[leadingSegments + index],
		);
	}
	return params;
}

/**
 * Checks that caller-provided params include every param of `path`.
 *
 * @remarks Values are not decoded; callers pass them already decoded.
 */
export function assertPathParams(
	path: string,
	params: Record<string, string>,
): Record<string, string> {
	const missing = pathParamNames(path).filter((name) => !(name in params));
	if (missing.length > 0) {
		throw new Error(
			`Params for route path "${path}" are missing ${missing.map((name) => `"${name}"`).join(", ")}.`,
		);
	}
	return params;
}
