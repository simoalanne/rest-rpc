import type { WebSocketRouteDeclaration } from "@contract-first-api/core/contract";
import type {
	WebSocketImplementationTree,
	WebSocketRouteImplementation,
} from "../websocket/route.ts";

const isWebSocketRouteImplementation = (
	value: unknown,
): value is WebSocketRouteImplementation<WebSocketRouteDeclaration> =>
	typeof value === "object" &&
	value !== null &&
	"route" in value &&
	"handler" in value;

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
