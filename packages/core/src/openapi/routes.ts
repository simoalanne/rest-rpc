import type { RouteDeclaration } from "../contract/route.ts";
import type { OpenApiRouteDeclaration } from "./types.ts";

export const isOpenApiRoute = (
	route: RouteDeclaration,
): route is OpenApiRouteDeclaration =>
	(!route.options || route.options.mode === "http") &&
	route.responses !== undefined;

export const toOpenApiPath = (path: string) =>
	path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
