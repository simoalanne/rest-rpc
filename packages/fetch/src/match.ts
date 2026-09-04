import {
	createRouteMatcher,
	flattenRouteImplementations,
	type ImplementationTree,
	type ServerHttpRouteDeclaration,
} from "@rest-rpc/server";

export const createFetchRouteMatcher = (
	implementations: ImplementationTree<ServerHttpRouteDeclaration>,
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

		if (!match.matched) return undefined;

		const implementation = implementationsByRoute.get(
			match.route as ServerHttpRouteDeclaration,
		);
		if (!implementation) return undefined;

		return {
			type: "match" as const,
			implementation,
			params: match.params,
		};
	};
};
