export const pathParamPattern = /:([A-Za-z0-9_]+)|\{([A-Za-z0-9_]+)\}/g;

const pathParamSegmentPattern = /^(?::([A-Za-z0-9_]+)|\{([A-Za-z0-9_]+)\})$/;

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

export const getPathParamNames = (path: string) =>
	[...path.matchAll(pathParamPattern)].map((match) =>
		pathParamNameFromCaptures(match[1], match[2]),
	);

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
	path.replace(pathParamPattern, (_match, colonName, openApiName) =>
		replace(pathParamNameFromCaptures(colonName, openApiName)),
	);

export const toColonPath = (path: string) =>
	replacePathParams(path, (name) => `:${name}`);

export const toOpenApiPath = (path: string) =>
	replacePathParams(path, (name) => `{${name}}`);
