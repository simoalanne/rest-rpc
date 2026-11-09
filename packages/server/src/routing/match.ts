import {
	contractRouteEntries,
	getPathParamNames,
	getPathParamSegmentName,
	isPathParamSegment,
	isRouteLeaf,
	toColonPath,
	toOpenApiPath,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";
import type { RouteError } from "@rest-rpc/core";
import { addRoute, createRouter, findRoute } from "rou3";
import type { RuntimeRouteHandler } from "../builder/routeBuilder.types.ts";
import type { CompileRoutesOptions } from "../pipeline/compileRoutes.ts";

const splitPath = (path: string) => path.split("/").filter(Boolean);

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

/** A route's declaration and handler, with values derived once instead of per request. */
export type RuntimeImplementation = {
	route: RouteDeclaration & { path: string };
	handler: (...args: never[]) => unknown;
	middleware?: readonly RuntimeRouteHandler[];
	/** The first declared response status, sent for plain handler results. */
	defaultStatus: number | undefined;
	/** The first declared request body media type. */
	defaultBodyMediaType: string | undefined;
	/** Whether the request body declares several media types. */
	requiresBodyContentType: boolean;
	/** The media type of each declared response status that declares exactly one. */
	defaultResponseMediaTypes: Readonly<Record<number, string>>;
	/** Creates each declared error by code, received by handlers and middleware as `errors`. */
	errorFactories: Readonly<Record<string, (options?: unknown) => RouteError>>;
};

export type ImplementedRoute = {
	readonly "~restrpc": RouteDeclaration & {
		readonly handler: (...args: never[]) => unknown;
		readonly middleware?: readonly RuntimeRouteHandler[];
	};
};

export type RuntimeImplementationTree =
	| ImplementedRoute
	| { readonly [key: string]: RuntimeImplementationTree };

export function isImplementedRoute(value: unknown): value is ImplementedRoute {
	return (
		isRouteLeaf(value) &&
		typeof value["~restrpc"] === "object" &&
		value["~restrpc"] !== null &&
		"handler" in value["~restrpc"]
	);
}

type ErrorClass = new (options?: unknown) => RouteError;

const createErrorFactories = (
	errors: RouteDeclaration["errors"] = {},
): RuntimeImplementation["errorFactories"] =>
	Object.fromEntries(
		Object.entries(errors).map(([code, definition]) => [
			code,
			(options?: unknown) => new (definition as unknown as ErrorClass)(options),
		]),
	);

export function toRuntimeImplementation(
	declaration: ImplementedRoute["~restrpc"],
): RuntimeImplementation {
	const { handler, middleware, ...route } = declaration;
	if (
		route.request?.params?.length &&
		// A path derived from tree keys adds no dynamic segments to the prefix.
		getPathParamNames(route.path ?? route.prefix ?? "").length === 0
	) {
		throw new Error(
			`Route "${route.method} ${route.path ?? route.prefix ?? "(derived path)"}" declares params, but its path has no dynamic segments.`,
		);
	}
	const bodyMediaTypes = Object.keys(route.request?.body ?? {});
	const defaultResponseMediaTypes: Record<number, string> = {};
	for (const [status, response] of Object.entries(route.responses)) {
		const mediaTypes = Object.keys(response.content ?? {});
		if (mediaTypes.length === 1)
			defaultResponseMediaTypes[Number(status)] = mediaTypes[0]!;
	}
	const firstStatus = Object.keys(route.responses)[0];
	return {
		route: route as RuntimeImplementation["route"],
		handler,
		middleware,
		defaultStatus: firstStatus === undefined ? undefined : Number(firstStatus),
		defaultBodyMediaType: bodyMediaTypes[0],
		requiresBodyContentType: bodyMediaTypes.length > 1,
		defaultResponseMediaTypes,
		errorFactories: createErrorFactories(route.errors),
	};
}

/** Flattens and orders an implementation tree for route registration. */
export function flattenRouteImplementations(
	implementation: RuntimeImplementationTree,
): RuntimeImplementation[] {
	return [...contractRouteEntries(implementation)]
		.map(({ route }) =>
			toRuntimeImplementation(route as ImplementedRoute["~restrpc"]),
		)
		.sort((left, right) => compareRouteSpecificity(left.route, right.route));
}

/** Normalizes a route path; `paramSyntax` rewrites its param markers. */
export function resolveImplementationPath(
	path: string,
	paramSyntax?: CompileRoutesOptions["paramSyntax"],
): string {
	const normalized = `/${splitPath(path).join("/")}`;
	if (paramSyntax === "colon") return toColonPath(normalized);
	if (paramSyntax === "braces") return toOpenApiPath(normalized);
	return normalized;
}

// Most segments are not encoded, so only those with `%` are decoded.
const decodePathSegment = (segment: string) =>
	segment.includes("%") ? decodeURIComponent(segment) : segment;

/** A route matched by a route matcher, with its percent-decoded params. */
type MatchedRoute<TRoute> = {
	route: TRoute;
	/** `undefined` for routes without params. */
	params: Record<string, string> | undefined;
};

/** Compiles routes into a method and path matcher using rou3. */
export function createRouteMatcher<
	TRoute extends { readonly method: string; readonly path: string },
>(
	routes: readonly TRoute[],
): (method: string, pathname: string) => MatchedRoute<TRoute> | undefined {
	const router = createRouter<TRoute>();
	for (const route of routes) {
		addRoute(router, route.method, toColonPath(route.path), route);
	}

	return (method, pathname) => {
		const match = findRoute(router, method, pathname);
		if (!match) return undefined;
		// rou3 creates the params per match, so they are decoded in place.
		const { params } = match;
		for (const name in params) params[name] = decodePathSegment(params[name]!);
		return { route: match.data, params };
	};
}

/** The param segments of a route path, parsed once per route. */
export type PathParams = {
	path: string;
	segmentCount: number;
	params: readonly { name: string; index: number }[];
};

export function parsePathParams(path: string): PathParams {
	const segments = splitPath(path);
	return {
		path,
		segmentCount: segments.length,
		params: segments.flatMap((segment, index) => {
			const name = getPathParamSegmentName(segment);
			return name === undefined ? [] : [{ name, index }];
		}),
	};
}

/** Params are aligned to the end of `pathname`, which may start with a mount prefix the router did not strip. */
export function readPathParams(
	{ path, segmentCount, params }: PathParams,
	pathname: string,
): Record<string, string> {
	const pathnameSegments = splitPath(pathname);
	const leadingSegments = pathnameSegments.length - segmentCount;
	if (leadingSegments < 0) {
		throw new Error(
			`Request path "${pathname}" has fewer segments than route path "${path}".`,
		);
	}

	const values: Record<string, string> = {};
	for (const { name, index } of params) {
		values[name] = decodePathSegment(
			pathnameSegments[leadingSegments + index]!,
		);
	}
	return values;
}

/** Reads `request.params` set by a router such as Bun's or Express, or `undefined` unless every param is a string. */
export function readAttachedPathParams(
	{ params }: PathParams,
	request: object,
): Record<string, string> | undefined {
	const values = (request as { params?: unknown }).params;
	if (typeof values !== "object" || values === null) return undefined;
	for (const { name } of params) {
		if (typeof (values as Record<string, unknown>)[name] !== "string")
			return undefined;
	}
	return values as Record<string, string>;
}

/** Checks that caller-provided params include every param of a route path. */
export function assertPathParams(
	{ path, params }: PathParams,
	values: Record<string, string>,
): Record<string, string> {
	for (const { name } of params) {
		if (name in values) continue;
		// Only the failure path collects every missing name for the message.
		const missing = params.filter((param) => !(param.name in values));
		throw new Error(
			`Params for route path "${path}" are missing ${missing.map((param) => `"${param.name}"`).join(", ")}.`,
		);
	}
	return values;
}
