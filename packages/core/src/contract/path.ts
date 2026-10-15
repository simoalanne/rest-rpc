import type { AbsolutePath, RouteDeclaration } from "./routeDeclaration.ts";

/** Returns the declared path, or the path derived from the route's tree keys. */
export const resolveRoutePath = (
	route: Pick<RouteDeclaration, "path">,
	treePath: readonly string[],
): AbsolutePath => route.path ?? `/${treePath.join("/")}`;

const pathParamSegmentPattern = /^(?::([^/]+)|\{([^/]+)\})$/;

const pathParamNameFromCaptures = (
	colonName: string | undefined,
	openApiName: string | undefined,
) => {
	const name = colonName ?? openApiName;
	if (name === undefined) {
		throw new Error("Expected path param match to include a name.");
	}
	return name;
};

export const getPathParamSegmentName = (segment: string) => {
	const match = pathParamSegmentPattern.exec(segment);
	if (!match) return undefined;
	return pathParamNameFromCaptures(match[1], match[2]);
};

export const isPathParamSegment = (segment: string) =>
	getPathParamSegmentName(segment) !== undefined;

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
