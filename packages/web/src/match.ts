import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";
import {
	type Contract,
	createRouteMatcher,
	flattenRouteImplementations,
	type ImplementationTree,
	type RouteImplementation,
} from "@rest-rpc/server";

type WebContract = Contract<HttpRouteDeclaration>;

export type WebRouteMatch = {
	implementation: RouteImplementation<HttpRouteDeclaration>;
	params: Record<string, string>;
};

export const createWebRouteMatcher = (
	implementations: ImplementationTree<HttpRouteDeclaration>,
) => {
	const routes = flattenRouteImplementations(implementations);

	const routesByMethod = new Map<
		string,
		RouteImplementation<HttpRouteDeclaration>[]
	>();

	for (const implementation of routes) {
		const methodRoutes = routesByMethod.get(implementation.route.method) ?? [];
		methodRoutes.push(implementation);
		routesByMethod.set(implementation.route.method, methodRoutes);
	}

	const matchersByMethod = new Map(
		Array.from(routesByMethod.entries()).map(([method, methodRoutes]) => {
			const routeContract = Object.fromEntries(
				methodRoutes.map((implementation, index) => [
					String(index),
					implementation.route,
				]),
			) as WebContract;

			return [
				method,
				{
					matchRoute: createRouteMatcher(routeContract),
					implementationsByRoute: new Map<
						HttpRouteDeclaration,
						RouteImplementation<HttpRouteDeclaration>
					>(
						methodRoutes.map((implementation) => [
							implementation.route,
							implementation,
						]),
					),
				},
			];
		}),
	);

	return (request: Request): WebRouteMatch | undefined => {
		const url = new URL(request.url);
		const methodMatcher = matchersByMethod.get(request.method);
		if (!methodMatcher) return undefined;

		const match = methodMatcher.matchRoute({
			method: request.method,
			path: url.pathname,
		});

		if (!match) return undefined;

		const implementation = methodMatcher.implementationsByRoute.get(
			match.route as HttpRouteDeclaration,
		);
		if (!implementation) return undefined;

		return {
			implementation,
			params: match.params,
		};
	};
};
