import type { RouteDeclaration } from "@contract-first-api/core/contract";

const splitPath = (path: string) => path.split("/").filter(Boolean);
const isParamSegment = (segment: string) => segment.startsWith(":");

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

		const leftIsParam = isParamSegment(leftSegment);
		const rightIsParam = isParamSegment(rightSegment);

		if (leftIsParam !== rightIsParam) {
			return leftIsParam ? 1 : -1;
		}

		return leftSegment.localeCompare(rightSegment);
	}

	return left.method.localeCompare(right.method);
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type PathMatcher = (pathname: string) => Record<string, string> | null;

export const createPathMatcher = (path: string): PathMatcher => {
	const keys: string[] = [];
	const segments = splitPath(path);
	const pattern =
		segments.length === 0
			? "/"
			: `/${segments
					.map((segment) => {
						if (!isParamSegment(segment)) return escapeRegExp(segment);
						keys.push(segment.slice(1));
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

export type MatchableRequest = {
	path: string;
	method: string;
};

export type RouteMatcher<TRoute extends RouteDeclaration = RouteDeclaration> = {
	route: TRoute;
	matchPath: PathMatcher;
};

type RouteMatcherSource<TRoute extends RouteDeclaration> =
	| TRoute
	| { route: TRoute };

const getRoute = <TRoute extends RouteDeclaration>(
	source: RouteMatcherSource<TRoute>,
): TRoute => ("route" in source ? source.route : source);

export type RouteMatch<TRoute extends RouteDeclaration = RouteDeclaration> = {
	route: TRoute;
	params: Record<string, string>;
};

export const createRouteMatchers = <
	const TRoute extends RouteDeclaration = RouteDeclaration,
>(
	sources: readonly RouteMatcherSource<TRoute>[],
): RouteMatcher<TRoute>[] =>
	sources
		.map(getRoute)
		.sort(compareRouteSpecificity)
		.map((route) => ({
			route,
			matchPath: createPathMatcher(route.path),
		}));

export const matchRoute = (
	matchers: readonly RouteMatcher[],
	req: MatchableRequest,
): RouteMatch | null => {
	const pathname = req.path;
	for (const route of matchers) {
		const params = route.matchPath(pathname);
		if (route.route.method === req.method && params !== null) {
			return {
				route: route.route,
				params,
			};
		}
	}

	return null;
};
