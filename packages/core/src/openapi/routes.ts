import type { RouteDeclaration } from "../contract/contract.ts";
import type { OpenApiRouteDeclaration } from "./types.ts";

export const isOpenApiRoute = (
	route: RouteDeclaration,
): route is OpenApiRouteDeclaration => route.mode !== "webSocket";
