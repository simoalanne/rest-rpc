import {
	type Contract,
	flattenContractRoutes,
	getPathParamSegmentName,
	isPathParamSegment,
	type RouteDeclaration,
} from "@rest-rpc/core/contract";

const splitPath = (path: string) => path.split("/").filter(Boolean);

export const compareRouteSpecificity = (
	left: RouteDeclaration,
	right: RouteDeclaration,
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

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createPathMatcher = (path: string) => {
	const keys: string[] = [];
	const segments = splitPath(path);
	const pattern =
		segments.length === 0
			? "/"
			: `/${segments
					.map((segment) => {
						const paramName = getPathParamSegmentName(segment);
						if (!paramName) return escapeRegExp(segment);
						keys.push(paramName);
						return "([^/]+)";
					})
					.join("/")}`;
	const regex = new RegExp(`^${pattern}/?$`);

	return (pathname: string) => {
		const match = regex.exec(pathname);
		if (!match) return null;

		return keys.reduce(
			(params, key, index) => {
				params[key] = decodeURIComponent(match[index + 1] ?? "");
				return params;
			},
			{} as Record<string, string>,
		);
	};
};

type PathMatch = {
	routes: Map<string, RouteDeclaration>;
	params: Record<string, string>;
};

const createPathRouter = (routes: RouteDeclaration[]) => {
	const matchers = routes.sort(compareRouteSpecificity).reduce(
		(matchers, route) => {
			const lastMatcher = matchers.at(-1);
			if (lastMatcher?.path === route.path) {
				if (!lastMatcher.routes.has(route.method)) {
					lastMatcher.routes.set(route.method, route);
				}
				return matchers;
			}

			matchers.push({
				path: route.path,
				routes: new Map([[route.method, route]]),
				matchPath: createPathMatcher(route.path),
			});
			return matchers;
		},
		[] as {
			path: string;
			routes: Map<string, RouteDeclaration>;
			matchPath: (pathname: string) => Record<string, string> | null;
		}[],
	);

	return {
		matchPath(pathname: string): PathMatch | null {
			for (const matcher of matchers) {
				const params = matcher.matchPath(pathname);
				if (params === null) continue;

				return {
					routes: matcher.routes,
					params,
				};
			}

			return null;
		},
	};
};

/**
 * A successful route match from `createRouteMatcher()`.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#dispatch-adapters}
 */
export type RouteMatcherMatch = {
	type: "match";
	route: RouteDeclaration;
	params: Record<string, string>;
};

/**
 * A route match result for a path with no matching HTTP method.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#dispatch-adapters}
 */
export type RouteMatcherMethodNotAllowed = {
	type: "methodNotAllowed";
	allowedMethods: string[];
};

/**
 * The result returned by a route matcher.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#dispatch-adapters}
 */
export type RouteMatcherResult =
	| RouteMatcherMatch
	| RouteMatcherMethodNotAllowed
	| null;

/**
 * Creates a path and method matcher for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#dispatch-adapters}
 */
export function createRouteMatcher(contract: Contract) {
	const pathRouter = createPathRouter(flattenContractRoutes(contract));

	return (req: { path: string; method: string }): RouteMatcherResult => {
		const match = pathRouter.matchPath(req.path);
		if (!match) return null;

		const route = match.routes.get(req.method);
		if (!route) {
			return {
				type: "methodNotAllowed",
				allowedMethods: Array.from(match.routes.keys()),
			};
		}

		return {
			type: "match",
			route,
			params: match.params,
		};
	};
}
