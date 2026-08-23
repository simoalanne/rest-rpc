import type { RouteDeclaration } from "../contract/contract.ts";
import { isJsonQuery } from "../contract/request.ts";
import { groupRequestInput } from "../contract/validate.ts";

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

const serializeCacheKey = (cacheKey: readonly string[]) =>
	cacheKey.map(encodeTagSegment).join(".");

const serializeRequest = (request: NextFetchTagRequest | undefined) => {
	const entries = Object.entries(stripUndefinedFields(request) ?? {}).sort(
		([left], [right]) => left.localeCompare(right),
	);

	if (entries.length === 0) return undefined;

	return entries.flat().map(encodeTagSegment).join(":");
};

const getNextFetchTagRequest = (
	route: RouteDeclaration,
	request: NextFetchTagRequest | undefined,
) => {
	if (!request) return undefined;

	const grouped = groupRequestInput(route, request, {
		strictRequestKeys: false,
	});

	return {
		...grouped.pathParams,
		...(isJsonQuery(route.query)
			? { query: JSON.stringify(grouped.query) }
			: (grouped.query as Record<string, unknown> | undefined)),
	};
};

const createNextFetchTag = (
	cacheKey: readonly string[],
	request: NextFetchTagRequest | undefined,
	tagPrefix?: string,
) => {
	const tag = `${tagPrefix ?? DEFAULT_NEXT_FETCH_TAG_PREFIX}:${serializeCacheKey(cacheKey)}`;
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
	request?: NextFetchTagRequest,
	options?: { tagPrefix?: string },
): string[] {
	const cacheKey = route.cacheKey ?? [];
	const tagRequest = getNextFetchTagRequest(route, request);
	const routeTag = createNextFetchTag(cacheKey, undefined, options?.tagPrefix);
	const exactTag = createNextFetchTag(cacheKey, tagRequest, options?.tagPrefix);

	return Array.from(new Set([exactTag, routeTag]));
}
