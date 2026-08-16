import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { type as schemaType } from "../standard-schema/index.ts";
import type {
	CommonOpenApiRouteOptions,
	Contract,
	OpenApiResponseOptions,
	OpenApiRouteOptions,
	RouteMetadata,
} from "./contract.ts";
import { getPathParamNames } from "./path.ts";
import {
	getRouteResponses,
	type RouteResponses,
	resolveRouteResponses,
} from "./response.ts";
import { contractRouteEntries } from "./traversal.ts";

export type NormalizeContractOptions = {
	pathPrefix?: string;
	metadata?: RouteMetadata;
	commonResponses?: RouteResponses;
	commonHeaders?: Record<string, StandardSchemaV1>;
	commonOpenApi?: CommonOpenApiRouteOptions;
};

export const joinPathPrefix = (prefix: string, path: string) => {
	const normalizedPrefix = prefix.replace(/\/+$/, "");
	const normalizedPath = path.replace(/^\/+/, "");

	if (!normalizedPrefix) return normalizedPath ? `/${normalizedPath}` : "/";
	if (!normalizedPath) return normalizedPrefix;

	return `${normalizedPrefix}/${normalizedPath}`;
};

const mergeUnique = (common: string[] = [], route: string[] = []) => [
	...new Set([...common, ...route]),
];

const mergeOpenApiResponse = (
	common: OpenApiResponseOptions | undefined,
	route: OpenApiResponseOptions | undefined,
): OpenApiResponseOptions => ({
	...common,
	...route,
	...(common?.headers || route?.headers
		? {
				headers: {
					...common?.headers,
					...route?.headers,
				},
			}
		: {}),
});

const mergeOpenApiResponses = (
	common: OpenApiRouteOptions["responses"],
	route: OpenApiRouteOptions["responses"],
) => {
	const statuses = new Set([
		...Object.keys(common ?? {}),
		...Object.keys(route ?? {}),
	]);

	return Object.fromEntries(
		[...statuses].map((status) => [
			status,
			mergeOpenApiResponse(common?.[Number(status)], route?.[Number(status)]),
		]),
	);
};

const mergeOpenApi = (
	common: CommonOpenApiRouteOptions | undefined,
	route: OpenApiRouteOptions | undefined,
): OpenApiRouteOptions | undefined => {
	if (!common && !route) return undefined;

	return {
		...common,
		...route,
		...(common?.tags || route?.tags
			? { tags: mergeUnique(common?.tags, route?.tags) }
			: {}),
		...(common?.extensions || route?.extensions
			? {
					extensions: {
						...common?.extensions,
						...route?.extensions,
					},
				}
			: {}),
		...(common?.responses || route?.responses
			? {
					responses: mergeOpenApiResponses(common?.responses, route?.responses),
				}
			: {}),
	};
};

const assertStaticPathPrefix = (pathPrefix: string | undefined) => {
	if (!pathPrefix) return;
	const pathParams = getPathParamNames(pathPrefix);
	if (pathParams.length === 0) return;

	throw new Error("Router pathPrefix cannot include path params.");
};

export const normalizeContract = <TContract extends Contract>(
	contract: TContract,
	options?: NormalizeContractOptions,
): TContract => {
	assertStaticPathPrefix(options?.pathPrefix);

	for (const { route, path } of contractRouteEntries(contract)) {
		const pathParams = getPathParamNames(route.path);
		if (!route.pathParams && pathParams.length > 0) {
			route.pathParams = Object.fromEntries(
				pathParams.map((key) => [key, schemaType<string>()] as const),
			);
			if (route.requestKeys) {
				for (const key of pathParams) {
					route.requestKeys[key] = "pathParams";
				}
			}
		}

		const pathPrefix = options?.pathPrefix;
		if (pathPrefix) {
			route.path = joinPathPrefix(pathPrefix, route.path);
		}

		route.metadata = {
			...options?.metadata,
			...route.metadata,
		};

		route.openApi = mergeOpenApi(options?.commonOpenApi, route.openApi);

		if (route.mode !== "webSocket") {
			route.cacheKey ??= path;
			route.responses = {
				...options?.commonResponses,
				...resolveRouteResponses(route),
			};
			getRouteResponses(route);
			if ("response" in route) {
				delete route.response;
			}
		}

		if (options?.commonHeaders) {
			route.headers = {
				...options.commonHeaders,
				...route.headers,
			};
		}
	}

	return contract;
};
