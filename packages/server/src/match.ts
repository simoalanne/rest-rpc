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

type RouteMatcherResult =
	| {
			matched: true;
			route: RouteDeclaration;
			params: Record<string, string>;
	  }
	| { matched: false; route: undefined; params: undefined };

/**
 * Creates a path and method matcher for a contract tree.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#dispatch-adapters}
 */
export function createRouteMatcher(contract: Contract) {
	const matchers = flattenContractRoutes(contract)
		.sort(compareRouteSpecificity)
		.map((route) => ({ route, matchPath: createPathMatcher(route.path) }));

	return (req: { path: string; method: string }): RouteMatcherResult => {
		for (const matcher of matchers) {
			if (matcher.route.method !== req.method) continue;
			const params = matcher.matchPath(req.path);
			if (params === null) continue;

			return {
				matched: true,
				route: matcher.route,
				params,
			};
		}

		return { matched: false, route: undefined, params: undefined };
	};
}
