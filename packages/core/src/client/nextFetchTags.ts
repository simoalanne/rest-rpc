import type { RouteDeclaration } from "../contract/contract.ts";
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
		unknownRequestKeys: "strip",
	});

	return {
		...grouped.pathParams,
		...grouped.query,
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

export const getNextFetchTags = (
	route: RouteDeclaration,
	request?: NextFetchTagRequest,
	options?: { tagPrefix?: string },
): string[] => {
	const cacheKey = route.cacheKey ?? [];
	const tagRequest = getNextFetchTagRequest(route, request);
	const routeTag = createNextFetchTag(cacheKey, undefined, options?.tagPrefix);
	const exactTag = createNextFetchTag(cacheKey, tagRequest, options?.tagPrefix);

	return Array.from(new Set([exactTag, routeTag]));
};
