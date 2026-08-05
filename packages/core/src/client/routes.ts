import type {
	RouteDeclaration,
	WebSocketRouteDeclaration,
} from "../contract/route.ts";
import { mapObjectValues } from "../contract/traversal.ts";
import type { ApiClientFor, ApiClientRouteValue } from "./types.ts";

export const isApiClientRouteNode = (
	value: unknown,
): value is ApiClientRouteValue =>
	typeof value === "object" &&
	value !== null &&
	("fetchResponse" in value || "openConnection" in value);

export const isWebSocketRouteNode = (
	route: RouteDeclaration,
): route is WebSocketRouteDeclaration => route.options?.mode === "websocket";

export const isHttpRouteNode = (route: RouteDeclaration) =>
	!isWebSocketRouteNode(route);

export const isSuccessStatus = (status: number) =>
	status >= 200 && status < 300;

export const getSuccessfulResponseStatuses = (route: RouteDeclaration) => {
	if (!isHttpRouteNode(route)) return [];

	return Object.keys(route.responses).map(Number).filter(isSuccessStatus);
};

export const hasSingleSuccessfulResponse = (route: RouteDeclaration) =>
	getSuccessfulResponseStatuses(route).length === 1;

export const mapApiClientContract = (
	apiClient: ApiClientFor,
	mappingFn: (leaf: ApiClientRouteValue, path: string[]) => unknown,
) => mapObjectValues(apiClient, isApiClientRouteNode, mappingFn);
