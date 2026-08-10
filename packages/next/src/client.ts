import type {
	ApiClientFor,
	ApiClientOptions,
	Contract,
	PrepareFetchInput,
} from "@rest-rpc/core";
import { getRouteCacheTags, initClient } from "@rest-rpc/core";
import type { HttpRouteDeclaration } from "@rest-rpc/core/contract";

type NextFetchOptions = RequestInit & {
	next?: {
		tags?: string[];
		[key: string]: unknown;
	};
};

export type NextClientOptions = ApiClientOptions & {
	automaticFetchTags?: {
		enabled: boolean;
		tagPrefix?: string;
	};
};

const isHttpRoute = (route: {
	responses?: unknown;
}): route is HttpRouteDeclaration => "responses" in route;

const prepareFetchWithTags = (
	{ route, request, init }: PrepareFetchInput,
	tagPrefix?: string,
) => {
	if (!isHttpRoute(route)) return init;
	if (route.method !== "GET") return init;

	const nextInit = init as NextFetchOptions;

	return {
		...nextInit,
		next: {
			...nextInit.next,
			tags: [
				...(nextInit.next?.tags ?? []),
				...getRouteCacheTags(route, {
					request,
					prefix: tagPrefix,
				}),
			],
		},
	};
};

export const initNextClient = <TContract extends Contract>(
	contract: TContract,
	options: NextClientOptions,
): ApiClientFor<TContract> => {
	const { automaticFetchTags, prepareFetch, ...clientOptions } = options;

	if (!automaticFetchTags?.enabled) {
		return initClient(contract, options);
	}

	return initClient(contract, {
		...clientOptions,
		prepareFetch: async (input) => {
			const prepared = (await prepareFetch?.(input)) ?? input.init;
			return prepareFetchWithTags(
				{
					...input,
					init: prepared,
				},
				automaticFetchTags.tagPrefix,
			);
		},
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

export { getRouteCacheTags };
