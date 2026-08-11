import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	createRouteMatcher,
	flattenRouteImplementations,
	type ImplementationTree,
} from "@rest-rpc/server";

export const createWebRouteMatcher = (
	implementations: ImplementationTree<HttpRouteDeclaration>,
) => {
	const routes = flattenRouteImplementations(implementations);
	const routeContract = Object.fromEntries(
		routes.map((implementation, index) => [
			String(index),
			implementation.route,
		]),
	);
	const matchRoute = createRouteMatcher(routeContract);
	const implementationsByRoute = new Map(
		routes.map((implementation) => [implementation.route, implementation]),
	);

	return (request: Request) => {
		const url = new URL(request.url);
		const match = matchRoute({
			method: request.method,
			path: url.pathname,
		});

		if (!match) return undefined;
		if (match.type === "methodNotAllowed") {
			return match;
		}

		const implementation = implementationsByRoute.get(
			match.route as HttpRouteDeclaration,
		);
		if (!implementation) return undefined;

		return {
			type: "match" as const,
			implementation,
			params: match.params,
		};
	};
};
