import { groupRequestInput } from "./groupRequestInput.ts";
import type { ClientRequestRoute } from "./requestRoute.ts";

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

const serializeRouteIdentity = (
	route: readonly string[] | Pick<ClientRequestRoute, "method" | "path">,
) =>
	"method" in route
		? `${route.method.toLowerCase()}:${route.path}`
		: route.map(encodeTagSegment).join(".");

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
	route: ClientRequestRoute,
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
	routeIdentity: string,
	request: NextFetchTagRequest | undefined,
	tagPrefix?: string,
) => {
	const tag = `${tagPrefix ?? DEFAULT_NEXT_FETCH_TAG_PREFIX}:${routeIdentity}`;
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
	route: ClientRequestRoute,
	routeIdentity:
		| readonly string[]
		| Pick<ClientRequestRoute, "method" | "path">,
	request?: NextFetchTagRequest,
	options?: { tagPrefix?: string },
): string[] {
	const tagRequest = getNextFetchTagRequest(route, request);
	const serializedRouteIdentity = serializeRouteIdentity(routeIdentity);
	const routeTag = createNextFetchTag(
		serializedRouteIdentity,
		undefined,
		options?.tagPrefix,
	);
	const exactTag = createNextFetchTag(
		serializedRouteIdentity,
		tagRequest,
		options?.tagPrefix,
	);

	return Array.from(new Set([exactTag, routeTag]));
}
