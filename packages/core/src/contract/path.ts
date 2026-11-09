import type { AbsolutePath, RouteDefinition } from "./routeDefinition.ts";

/** Joins a prefix and a path. The `/` path resolves to the prefix itself. */
export const joinPrefix = (
	prefix: AbsolutePath | undefined,
	path: AbsolutePath,
): AbsolutePath =>
	prefix === undefined ? path : path === "/" ? prefix : `${prefix}${path}`;

/** The defined path, which includes the prefix, or the path of the tree keys under the prefix. */
export const resolveRoutePath = (
	route: Pick<RouteDefinition, "path" | "prefix">,
	treePath: readonly string[],
): AbsolutePath =>
	route.path ?? joinPrefix(route.prefix, `/${treePath.join("/")}`);

const pathParamSegmentPattern = /^(?::([^/]+)|\{([^/]+)\})$/;

export const getPathParamSegmentName = (segment: string) => {
	const match = pathParamSegmentPattern.exec(segment);
	return match ? (match[1] ?? match[2]) : undefined;
};

export const isPathParamSegment = (segment: string) =>
	getPathParamSegmentName(segment) !== undefined;

export const getPathParamNames = (path: string) =>
	path.split("/").flatMap((segment) => {
		const name = getPathParamSegmentName(segment);
		return name === undefined ? [] : [name];
	});

type PathParamSegmentName<TSegment extends string> =
	TSegment extends `:${infer TName}`
		? TName
		: TSegment extends `{${infer TName}}`
			? TName
			: never;

/** The names of the dynamic segments of a literal path, or `never` without any. */
export type PathParamNames<TPath> =
	TPath extends `${infer TSegment}/${infer TRest}`
		? PathParamSegmentName<TSegment> | PathParamNames<TRest>
		: TPath extends string
			? PathParamSegmentName<TPath>
			: never;

export const replacePathParams = (
	path: string,
	replace: (name: string) => string,
) =>
	path
		.split("/")
		.map((segment) => {
			const name = getPathParamSegmentName(segment);
			return name === undefined ? segment : replace(name);
		})
		.join("/");

export const toColonPath = (path: string) =>
	replacePathParams(path, (name) => `:${name}`);

export const toOpenApiPath = (path: string) =>
	replacePathParams(path, (name) => `{${name}}`);
