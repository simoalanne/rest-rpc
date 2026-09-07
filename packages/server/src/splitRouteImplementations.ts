import type {
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@rest-rpc/core/contract";
import {
	flattenRouteImplementations,
	type RuntimeImplementation,
} from "./match.ts";
import type {
	ImplementationTree,
	RouteImplementation,
	ServerHttpRouteDeclaration,
} from "./router.ts";

const isHttpImplementation = (
	implementation: RuntimeImplementation,
): implementation is RouteImplementation<ServerHttpRouteDeclaration> =>
	implementation.route.mode !== "webSocket";

const isWebSocketImplementation = (
	implementation: RuntimeImplementation,
): implementation is RouteImplementation<WebSocketRouteDeclaration> =>
	implementation.route.mode === "webSocket";

/**
 * Splits route implementations into HTTP and WebSocket groups for server adapters.
 *
 * @see {@link https://rest-rpc.dev/docs/advanced/building-server-adapters#splitting-implementations}
 */
export function splitRouteImplementations(
	implementations: ImplementationTree<RouteDeclaration>,
	handlers: {
		handleHttpRoutes: (
			routes: RouteImplementation<ServerHttpRouteDeclaration>[],
		) => void;
		handleWebSocketRoutes?: (
			routes: RouteImplementation<WebSocketRouteDeclaration>[],
		) => void;
	},
) {
	const implementationsList = flattenRouteImplementations(implementations);
	const routes = implementationsList.filter(isHttpImplementation);
	const webSocketRoutes = implementationsList.filter(isWebSocketImplementation);

	handlers.handleHttpRoutes(routes);
	handlers.handleWebSocketRoutes?.(webSocketRoutes);
}
