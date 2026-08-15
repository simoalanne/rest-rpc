import type { RouteDeclaration } from "../contract/contract.ts";
import type { OpenApiRouteDeclaration } from "./types.ts";

export const isOpenApiRoute = (
	route: RouteDeclaration,
): route is OpenApiRouteDeclaration =>
	(!route.options || route.options.mode === "http") &&
	route.responses !== undefined;
