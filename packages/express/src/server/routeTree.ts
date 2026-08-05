import type {
	HttpRouteDeclaration,
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "@contract-first-api/core/contract";
import type {
	WebSocketImplementationTree,
	WebSocketRouteImplementation,
} from "../websocket/route.ts";
import { compareRouteSpecificity } from "./match.ts";
import type { ImplementationTree, RouteImplementation } from "./router.ts";
import { isRouteImplementation } from "./router.ts";

const isWebSocketRouteImplementation = (
	value: unknown,
): value is WebSocketRouteImplementation<WebSocketRouteDeclaration> =>
	typeof value === "object" &&
	value !== null &&
	"route" in value &&
	"handler" in value;

export const flattenImplementationTree = (
	implementation: ImplementationTree,
): RouteImplementation<HttpRouteDeclaration>[] => {
	if (isRouteImplementation(implementation)) {
		return [implementation];
	}

	return Object.values(implementation).flatMap(flattenImplementationTree);
};

export const flattenWebSocketImplementationTree = (
	implementation: WebSocketImplementationTree,
): WebSocketRouteImplementation<WebSocketRouteDeclaration>[] => {
	if (isWebSocketRouteImplementation(implementation)) {
		return [implementation];
	}

	return Object.values(implementation).flatMap(
		flattenWebSocketImplementationTree,
	);
};

export const sortImplementations = <
	TImplementation extends { route: RouteDeclaration },
>(
	implementations: TImplementation[],
) =>
	implementations.sort((left, right) =>
		compareRouteSpecificity(left.route, right.route),
	);
