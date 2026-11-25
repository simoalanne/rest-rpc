import type { EmptyObject, Merge } from "@rest-rpc/core/utils";
import {
	contractRouteEntries,
	getPathParamNames,
	getPathParamSegmentName,
	isPathParamSegment,
	isRouteLeaf,
	type RouteDefinition,
} from "@rest-rpc/core/contract";
import type { RouteError } from "@rest-rpc/core";
import type { RuntimeRouteHandler } from "../builder/routeBuilder.types.ts";
import { readRequestPathname, stripMountPath } from "./requestUrl.ts";

const splitPath = (path: string) => path.split("/").filter(Boolean);

const compareRouteSpecificity = (
	left: RouteDefinition & { path: string },
	right: RouteDefinition & { path: string },
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

/** A route's definition and handler, with values derived once instead of per request. */
export type RuntimeImplementation = {
	route: RouteDefinition & { path: string };
	handler: (...args: never[]) => unknown;
	middleware?: readonly RuntimeRouteHandler[];
	/** Whether the route was completed with `.static()`, so its response is prepared once. */
	isStatic: boolean;
	/** The first defined response status, sent for plain handler results. */
	defaultStatus: number | undefined;
	/** Creates each defined error by code, received by handlers and middleware as `errors`. */
	errorFactories: Readonly<Record<string, (options?: unknown) => RouteError>>;
};

// `TContext` is the initial context the routes accept. By default they may
// require any.
export type ImplementedRoute<TContext extends object = never> = {
	readonly "~restrpc": RouteDefinition & {
		readonly handler: (...args: never[]) => unknown;
		readonly middleware?: readonly RuntimeRouteHandler[];
		readonly static?: true;
		readonly initialContext?: (context: TContext) => void;
	};
};

export type RuntimeImplementationTree<TContext extends object = never> =
	| ImplementedRoute<TContext>
	| { readonly [key: string]: RuntimeImplementationTree<TContext> };

// The `initialContext` parameter types of the routes in a tree, as a union.
type InitialContextParameters<T> = T extends {
	readonly "~restrpc": { readonly initialContext?: infer TParameter };
}
	? NonNullable<TParameter>
	: T extends object
		? { [K in keyof T]: InitialContextParameters<T[K]> }[keyof T]
		: never;

/**
 * The initial context a route tree requires: the intersection of its routes'
 * initial contexts.
 */
export type TreeInitialContext<T> =
	InitialContextParameters<T> extends (context: infer TContext) => void
		? [TContext] extends [never]
			? EmptyObject
			: Extract<Merge<TContext>, object>
		: EmptyObject;

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
	errors: RouteDefinition["errors"] = {},
): RuntimeImplementation["errorFactories"] =>
	Object.fromEntries(
		Object.entries(errors).map(([code, definition]) => [
			code,
			(options?: unknown) => new (definition as unknown as ErrorClass)(options),
		]),
	);

export function toRuntimeImplementation(
	definition: ImplementedRoute["~restrpc"],
): RuntimeImplementation {
	const { handler, middleware, static: isStatic, ...route } = definition;
	if (
		route.request?.params?.length &&
		// A path derived from tree keys adds no dynamic segments to the prefix.
		getPathParamNames(route.path ?? route.prefix ?? "").length === 0
	) {
		throw new Error(
			`Route "${route.method} ${route.path ?? route.prefix ?? "(derived path)"}" defines params, but its path has no dynamic segments.`,
		);
	}
	const firstStatus = Object.keys(route.responses)[0];
	return {
		route: route as RuntimeImplementation["route"],
		handler,
		middleware,
		isStatic: isStatic === true,
		defaultStatus: firstStatus === undefined ? undefined : Number(firstStatus),
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

/** Normalizes a route path. */
export function resolveImplementationPath(path: string): string {
	return `/${splitPath(path).join("/")}`;
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

/** Routes without params, by path and then by method. */
type StaticRoutes<TRoute> = Map<string, Map<string, TRoute>>;

/** A route registered on a trie node, with its param names in path order. */
type RouteLeaf<TRoute> = { route: TRoute; paramNames: readonly string[] };

/** Static children are tried before the param child at every depth. */
type RouteNode<TRoute> = {
	staticChildren: Map<string, RouteNode<TRoute>>;
	paramChild: RouteNode<TRoute> | undefined;
	leaves: Map<string, RouteLeaf<TRoute>>;
};

const createRouteNode = <TRoute>(): RouteNode<TRoute> => ({
	staticChildren: new Map(),
	paramChild: undefined,
	leaves: new Map(),
});

const getOrCreate = <TKey, TValue>(
	map: Map<TKey, TValue>,
	key: TKey,
	create: () => TValue,
) => {
	let value = map.get(key);
	if (value === undefined) {
		value = create();
		map.set(key, value);
	}
	return value;
};

// The first route registered for a path and method wins.
const addStaticRoute = <TRoute extends { method: string; path: string }>(
	staticRoutes: StaticRoutes<TRoute>,
	route: TRoute,
) => {
	const byMethod = getOrCreate(staticRoutes, route.path, () => new Map());
	if (!byMethod.has(route.method)) byMethod.set(route.method, route);
};

const addParamRoute = <TRoute extends { method: string; path: string }>(
	root: RouteNode<TRoute>,
	route: TRoute,
) => {
	let node = root;
	const paramNames: string[] = [];
	for (const segment of splitPath(route.path)) {
		const name = getPathParamSegmentName(segment);
		if (name === undefined) {
			node = getOrCreate(node.staticChildren, segment, () =>
				createRouteNode<TRoute>(),
			);
			continue;
		}
		if (paramNames.includes(name)) {
			throw new Error(
				`Route path "${route.path}" repeats the param "${name}".`,
			);
		}
		paramNames.push(name);
		node = node.paramChild ??= createRouteNode();
	}
	if (!node.leaves.has(route.method)) {
		node.leaves.set(route.method, { route, paramNames });
	}
};

// One trailing slash is ignored, as route paths have none.
const trimTrailingSlash = (path: string) =>
	path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

// Backtracks to the param child when the static branch has no route for the
// method, and collects the raw param values in path order.
const findLeaf = <TRoute>(
	node: RouteNode<TRoute>,
	segments: readonly string[],
	index: number,
	method: string,
	values: string[],
): RouteLeaf<TRoute> | undefined => {
	if (index === segments.length) return node.leaves.get(method);
	const segment = segments[index]!;
	if (segment === "") return undefined;
	const staticChild = node.staticChildren.get(segment);
	const staticLeaf =
		staticChild && findLeaf(staticChild, segments, index + 1, method, values);
	if (staticLeaf) return staticLeaf;
	if (!node.paramChild) return undefined;
	values.push(segment);
	const paramLeaf = findLeaf(
		node.paramChild,
		segments,
		index + 1,
		method,
		values,
	);
	if (!paramLeaf) values.pop();
	return paramLeaf;
};

// Empty segments are kept, so a path such as `/posts//comments` matches no route.
const matchParamRoute = <TRoute>(
	root: RouteNode<TRoute>,
	method: string,
	path: string,
): MatchedRoute<TRoute> | undefined => {
	const segments = path === "/" ? [] : path.slice(1).split("/");
	const values: string[] = [];
	const leaf = findLeaf(root, segments, 0, method, values);
	if (!leaf) return undefined;
	const params: Record<string, string> = {};
	leaf.paramNames.forEach((name, index) => {
		params[name] = decodePathSegment(values[index]!);
	});
	return { route: leaf.route, params };
};

/**
 * Compiles routes into a matcher. It matches the path of a request URL or
 * target, without the mount path, and requests outside the mount path are
 * unmatched. A `HEAD` request matches the `GET` route of its path.
 */
export function createRouteMatcher<
	TRoute extends { readonly method: string; readonly path: string },
>(
	routes: readonly TRoute[],
): (
	method: string,
	url: string,
	mountPath?: string,
) => MatchedRoute<TRoute> | undefined {
	// Routes without params are matched by their exact path, so only routes
	// with params go in the trie.
	const staticRoutes: StaticRoutes<TRoute> = new Map();
	const root = createRouteNode<TRoute>();
	for (const route of routes) {
		if (getPathParamNames(route.path).length === 0) {
			addStaticRoute(staticRoutes, route);
		} else {
			addParamRoute(root, route);
		}
	}

	return (method, url, mountPath) => {
		const pathname = readRequestPathname(url);
		const routePath = mountPath
			? stripMountPath(pathname, mountPath)
			: pathname;
		if (!routePath) return undefined;
		const routeMethod = method === "HEAD" ? "GET" : method;
		const path = trimTrailingSlash(routePath);
		const staticRoute = staticRoutes.get(path)?.get(routeMethod);
		if (staticRoute) return { route: staticRoute, params: undefined };
		return matchParamRoute(root, routeMethod, path);
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
