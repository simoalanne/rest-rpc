import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import { compareRouteSpecificity } from "./match.ts";
import type { ImplementationTree, RouteImplementation } from "./router.ts";
import {
	isHttpRouteImplementation,
	isRouteImplementation,
	isWebSocketRouteImplementation,
} from "./router.ts";

const flattenImplementationTree = <TRoute extends RouteDeclaration>(
	implementation: ImplementationTree<TRoute>,
): RouteImplementation<TRoute>[] => {
	if (isRouteImplementation(implementation)) return [implementation];

	return Object.values(implementation).flatMap(flattenImplementationTree);
};

export function flattenRouteImplementations<TRoute extends RouteDeclaration>(
	implementation: ImplementationTree<TRoute>,
): RouteImplementation<TRoute>[] {
	return flattenImplementationTree(implementation).sort((left, right) =>
		compareRouteSpecificity(left.route, right.route),
	);
}

export function registerRoutes(
	implementations: ImplementationTree<RouteDeclaration>,
	registerHttpRoutes: (
		routes: RouteImplementation<HttpRouteDeclaration>[],
	) => void,
	registerWebSocketRoutes?: (
		routes: RouteImplementation<WebSocketRouteDeclaration>[],
	) => void,
) {
	const implementationsList = flattenRouteImplementations(implementations);
	const routes = implementationsList.filter(isHttpRouteImplementation);
	const webSocketRoutes = implementationsList.filter(
		isWebSocketRouteImplementation,
	);

	registerHttpRoutes(routes);
	registerWebSocketRoutes?.(webSocketRoutes);
}
