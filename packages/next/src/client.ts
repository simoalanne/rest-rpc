import type {
	ApiClientFor,
	ApiClientOptions,
	Contract,
	FetchLike,
} from "@rest-rpc/core";
import { getRouteCacheTags, initClient } from "@rest-rpc/core";
import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";

type NextFetchOptions = RequestInit & {
	next?: {
		tags?: string[];
		[key: string]: unknown;
	};
};

export type NextClientFetchOptions = Omit<
	NextFetchOptions,
	"method" | "body" | "headers" | "signal"
>;

export type NextClientOptions = Omit<ApiClientOptions, "fetchOptions"> & {
	automaticFetchTags?: {
		enabled: boolean;
		tagPrefix?: string;
	};
	fetchOptions?: NextClientFetchOptions;
};

const createRouteCacheTagsForUrl = (
	url: string | URL | Request,
	prefix?: string,
) => {
	const parsed = new URL(url instanceof Request ? url.url : String(url));

	return Array.from(
		new Set([
			`${prefix ?? "rest-rpc"}:${parsed.pathname}${parsed.search}`,
			`${prefix ?? "rest-rpc"}:${parsed.pathname}`,
		]),
	);
};

const fetchWithTags = (fetchImpl: FetchLike, tagPrefix?: string): FetchLike => {
	return (url, init) => {
		if (init?.method !== "GET") return fetchImpl(url, init);

		const nextInit = init as NextFetchOptions;
		const taggedInit: NextFetchOptions = {
			...nextInit,
			next: {
				...nextInit.next,
				tags: [
					...(nextInit.next?.tags ?? []),
					...createRouteCacheTagsForUrl(url, tagPrefix),
				],
			},
		};

		return fetchImpl(url, taggedInit);
	};
};

export const initNextClient = <TContract extends Contract>(
	contract: TContract,
	options: NextClientOptions,
): ApiClientFor<TContract> => {
	const { automaticFetchTags, fetch, ...clientOptions } = options;

	if (!automaticFetchTags?.enabled) {
		return initClient(contract, options);
	}

	const fetchImpl = fetch ?? ((url, init) => globalThis.fetch(url, init));

	return initClient(contract, {
		...clientOptions,
		fetch: fetchWithTags(fetchImpl, automaticFetchTags.tagPrefix),
	});
};

export const getGeneratedTagsForRoute = (
	route: HttpRouteDeclaration,
	options?: { request?: Record<string, unknown>; tagPrefix?: string },
): string[] =>
	getRouteCacheTags(route, {
		request: options?.request,
		prefix: options?.tagPrefix,
	});
