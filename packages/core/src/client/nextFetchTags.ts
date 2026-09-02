import type { RouteDeclaration } from "../contract/contract.ts";
import { groupRequestInput } from "./groupRequestInput.ts";

const DEFAULT_NEXT_FETCH_TAG_PREFIX = "rest-rpc";
type NextFetchTagRequest = Record<string, unknown>;

const stripUndefinedFields = <TValue>(
	request: Record<string, TValue> | undefined,
) =>
	request
		? Object.fromEntries(
				Object.entries(request).filter(([, value]) => value !== undefined),
			)
		: undefined;

const encodeTagSegment = (value: unknown) => encodeURIComponent(String(value));

const sortJsonValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (typeof value !== "object" || value === null) return value;

	return Object.fromEntries(
		Object.entries(stripUndefinedFields(value as Record<string, unknown>) ?? {})
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, sortJsonValue(entry)]),
	);
};

const serializeTagValue = (value: unknown) =>
	typeof value === "object" && value !== null
		? JSON.stringify(sortJsonValue(value))
		: String(value);

const serializeRoutePath = (routePath: readonly string[]) =>
	routePath.map(encodeTagSegment).join(".");

const serializeRequest = (request: NextFetchTagRequest | undefined) => {
	const entries = Object.entries(stripUndefinedFields(request) ?? {}).sort(
		([left], [right]) => left.localeCompare(right),
	);

	if (entries.length === 0) return undefined;

	return entries
		.flatMap(([key, value]) => [key, serializeTagValue(value)])
		.map(encodeTagSegment)
		.join(":");
};

const getNextFetchTagRequest = (
	route: RouteDeclaration,
	request: NextFetchTagRequest | undefined,
) => {
	if (!request) return undefined;

	if (route.request?.flattenKeys === false) {
		return {
			params: request.params,
			query: request.query,
		};
	}

	const grouped = groupRequestInput(route, request, {
		strictRequestKeys: false,
	});

	return {
		...(grouped.params as Record<string, unknown> | undefined),
		...(grouped.query as Record<string, unknown> | undefined),
	};
};

const createNextFetchTag = (
	routePath: readonly string[],
	request: NextFetchTagRequest | undefined,
	tagPrefix?: string,
) => {
	const tag = `${tagPrefix ?? DEFAULT_NEXT_FETCH_TAG_PREFIX}:${serializeRoutePath(routePath)}`;
	const serializedRequest = serializeRequest(request);
	return serializedRequest ? `${tag}:${serializedRequest}` : tag;
};

/**
 * Returns the deterministic Next.js fetch tags for a route and request.
 *
 * @remarks Tags include path params and query params only; bodies and headers are
 * intentionally excluded.
 * @see {@link https://rest-rpc.dev/docs/client/fetch-client#use-in-nextjs}
 */
export function getNextFetchTags(
	route: RouteDeclaration,
	routePath: readonly string[],
	request?: NextFetchTagRequest,
	options?: { tagPrefix?: string },
): string[] {
	const tagRequest = getNextFetchTagRequest(route, request);
	const routeTag = createNextFetchTag(routePath, undefined, options?.tagPrefix);
	const exactTag = createNextFetchTag(
		routePath,
		tagRequest,
		options?.tagPrefix,
	);

	return Array.from(new Set([exactTag, routeTag]));
}
