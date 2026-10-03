import type {
	HttpMethod,
	RouteDeclaration,
	RouteRequestDeclaration,
} from "./routeDeclaration.ts";

/** The request segment that carries flat input on the wire: query for GET, body otherwise. */
export const flatInputSegment = (method: HttpMethod): "query" | "body" =>
	method === "GET" ? "query" : "body";

/**
 * Resolves the request schemas a route reads from each wire segment.
 *
 * @remarks Flat input is declared under `request.input` and moves to the
 * segment selected by {@link flatInputSegment}. GET routes drop the content
 * type because they have no body.
 */
export const resolveRouteRequest = (
	route: Pick<RouteDeclaration, "method" | "request">,
): RouteRequestDeclaration | undefined => {
	if (!route.request?.input) return route.request;
	const { input, contentType, ...request } = route.request;
	return flatInputSegment(route.method) === "query"
		? { ...request, query: input }
		: { ...request, body: input, contentType };
};
