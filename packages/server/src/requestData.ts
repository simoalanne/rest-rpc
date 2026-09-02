import type { RouteDeclaration } from "@rest-rpc/core/contract";
import {
	isCustomBody,
	isFormBody,
	isJsonQuery,
	isMultipartBody,
} from "@rest-rpc/core/contract";

const flattenObjectSegment = (
	route: RouteDeclaration,
	segment: "body" | "query" | "params" | "headers",
	value: unknown,
) => {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	throw new Error(
		`Cannot flatten ${segment} output for ${route.method} ${route.path}: expected a non-null object, received ${Array.isArray(value) ? "an array" : typeof value}.`,
	);
};

const flattenQuerySegment = (
	route: RouteDeclaration,
	request: Record<string, unknown>,
) =>
	isJsonQuery(route.request?.query)
		? { query: request.query }
		: route.request?.query
			? { ...flattenObjectSegment(route, "query", request.query) }
			: undefined;

const flattenPathAndHeaders = (
	route: RouteDeclaration,
	request: Record<string, unknown>,
) => ({
	...(route.request?.params
		? flattenObjectSegment(route, "params", request.params)
		: {}),
	...(route.request?.headers
		? flattenObjectSegment(route, "headers", request.headers)
		: {}),
});

export const flattenRequestData = (
	route: RouteDeclaration,
	request: Record<string, unknown>,
) => {
	if (route.request?.flattenKeys === false) return request;

	return {
		...(route.mode !== "webSocket"
			? isCustomBody(route.request?.body) ||
				isFormBody(route.request?.body) ||
				isMultipartBody(route.request?.body)
				? { body: request.body }
				: route.request?.body
					? flattenObjectSegment(route, "body", request.body)
					: undefined
			: {}),
		...flattenQuerySegment(route, request),
		...flattenPathAndHeaders(route, request),
	};
};
