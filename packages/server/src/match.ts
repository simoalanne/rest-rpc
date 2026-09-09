import {
	type AnyShorthandRouteDeclaration,
	type BaseRouteDeclaration,
	getPathParamSegmentName,
	isPathParamSegment,
	isShorthandRouteDeclaration,
} from "@rest-rpc/core/contract";

const splitPath = (path: string) => path.split("/").filter(Boolean);

export const compareRouteSpecificity = (
	left: BaseRouteDeclaration,
	right: BaseRouteDeclaration,
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

export const createPathMatcher = (path: string) => {
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

export type RuntimeImplementation = {
	route: BaseRouteDeclaration;
	handler: (...args: never[]) => unknown;
};

type ShorthandRuntimeImplementation = {
	route: AnyShorthandRouteDeclaration;
	handler: (...args: never[]) => unknown;
};

/** An implementation or nested implementation tree consumed at runtime. */
export type RuntimeImplementationTree =
	| RuntimeImplementation
	| ShorthandRuntimeImplementation
	| readonly RuntimeImplementationTree[]
	| { readonly [key: string]: RuntimeImplementationTree };

const isRuntimeImplementation = (
	value: unknown,
): value is RuntimeImplementation | ShorthandRuntimeImplementation =>
	typeof value === "object" &&
	value !== null &&
	"route" in value &&
	"handler" in value;

const flattenImplementationTree = (
	implementation: RuntimeImplementationTree,
	path: string[] = [],
): RuntimeImplementation[] => {
	if (Array.isArray(implementation)) {
		return implementation.flatMap((child) =>
			flattenImplementationTree(child, path),
		);
	}
	if (isRuntimeImplementation(implementation)) {
		if (!isShorthandRouteDeclaration(implementation.route)) {
			return [implementation as RuntimeImplementation];
		}
		return [
			{
				route: {
					...implementation.route,
					path: `/${path.join("/")}`,
				},
				handler: implementation.handler,
			},
		];
	}
	return Object.entries(implementation).flatMap(([key, child]) =>
		flattenImplementationTree(child, [...path, key]),
	);
};

export const flattenRouteImplementations = (
	implementation: RuntimeImplementationTree,
): RuntimeImplementation[] =>
	flattenImplementationTree(implementation).sort((left, right) =>
		compareRouteSpecificity(left.route, right.route),
	);

/** A matched route implementation and its decoded URL parameters. */
export type RouteMatch = {
	implementation: RuntimeImplementation;
	params: Record<string, string>;
};

/**
 * Compiles route implementations into a method and path matcher.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#dispatch-adapters}
 */
export function createRouteMatcher(implementations: RuntimeImplementationTree) {
	const matchers = flattenRouteImplementations(implementations).map(
		(implementation) => ({
			implementation,
			matchPath: createPathMatcher(implementation.route.path),
		}),
	);

	return (request: {
		path: string;
		method: string;
	}): RouteMatch | undefined => {
		for (const matcher of matchers) {
			if (matcher.implementation.route.method !== request.method) continue;
			const params = matcher.matchPath(request.path);
			if (params === null) continue;

			return {
				implementation: matcher.implementation,
				params,
			};
		}

		return undefined;
	};
}
