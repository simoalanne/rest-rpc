import type { RouteDeclaration } from "../contract/route.ts";
import { constructBaseRequest } from "./request.ts";
import type { RuntimeArgs } from "./types.ts";

const ROUTE_CACHE_TAG_BASE_URL = "http://rest-rpc.local";

const createRouteCacheTag = (
	pathname: string,
	search: string,
	prefix?: string,
) => `${prefix ?? "rest-rpc"}:${pathname}${search}`;

const generateRouteCacheTags = (url: string, prefix?: string) => {
	const parsed = new URL(url);
	return Array.from(
		new Set([
			createRouteCacheTag(parsed.pathname, parsed.search, prefix),
			createRouteCacheTag(parsed.pathname, "", prefix),
		]),
	);
};

export const getRouteCacheTags = (
	route: RouteDeclaration,
	options?: { request?: RuntimeArgs; prefix?: string },
): string[] => {
	const { url } = constructBaseRequest(
		ROUTE_CACHE_TAG_BASE_URL,
		route,
		options?.request ?? {},
		"strip",
	);

	return generateRouteCacheTags(url, options?.prefix);
};
