import type {
	Contract,
	RouteDeclaration,
} from "@contract-first-api/core/contract";
import { flattenContractRoutes } from "@contract-first-api/core/contract";

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

export const createPathMatcher = (path: string) => {
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

const resolveContractRoutes = (contract: Contract) => {
	return flattenContractRoutes(contract)
		.sort(compareRouteSpecificity)
		.map((route) => {
			return {
				route,
				matchPath: createPathMatcher(route.path),
			};
		});
};

export type MatchableRequest = {
	path: string;
	method: string;
};

export const matchRoute = (
	contract: Contract,
	req: MatchableRequest,
): RouteDeclaration | null => {
	const pathname = req.path;
	const matchedRoute = resolveContractRoutes(contract).find((route) => {
		const params = route.matchPath(pathname);
		return route.route.method === req.method && params !== null;
	});

	return matchedRoute ? matchedRoute.route : null;
};
