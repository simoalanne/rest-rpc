import type { RouteDeclaration } from "@rest-rpc/core/contract";
import { isCustomBody, isFormBody, isJsonQuery } from "@rest-rpc/core/contract";

const flattenObjectSegment = (value: unknown) =>
	value as Record<string, unknown> | undefined;

const flattenQuerySegment = (
	route: RouteDeclaration,
	request: Record<string, unknown>,
) =>
	isJsonQuery(route.query)
		? { query: request.query }
		: flattenObjectSegment(request.query);

const flattenPathAndHeaders = (request: Record<string, unknown>) => ({
	...flattenObjectSegment(request.pathParams),
	...flattenObjectSegment(request.headers),
});

export const flattenRequestData = (
	route: RouteDeclaration,
	request: Record<string, unknown>,
) => {
	if (route.flattenRequestKeys === false) return request;

	return {
		...(route.mode !== "webSocket"
			? isCustomBody(route.body) || isFormBody(route.body)
				? { body: request.body }
				: flattenObjectSegment(request.body)
			: {}),
		...flattenQuerySegment(route, request),
		...flattenPathAndHeaders(request),
	};
};
