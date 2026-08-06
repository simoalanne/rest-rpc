import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import type {
	CommonOpenApiRouteOptions,
	Contract,
	OpenApiRouteOptions,
	RouteMetadata,
	RouteResponses,
} from "./route.ts";
import { contractRoutes } from "./traversal.ts";

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
		...(common?.responseDescriptions || route?.responseDescriptions
			? {
					responseDescriptions: {
						...common?.responseDescriptions,
						...route?.responseDescriptions,
					},
				}
			: {}),
	};
};

export const normalizeContract = <TContract extends Contract>(
	contract: TContract,
	options?: NormalizeContractOptions,
): TContract => {
	for (const route of contractRoutes(contract)) {
		const pathPrefix = options?.pathPrefix;
		if (pathPrefix) {
			route.path = joinPathPrefix(pathPrefix, route.path);
		}

		route.metadata = {
			...options?.metadata,
			...route.metadata,
		};

		route.openApi = mergeOpenApi(options?.commonOpenApi, route.openApi);

		if (route.responses !== undefined) {
			route.responses = {
				...options?.commonResponses,
				...route.responses,
			};
		}

		if (options?.commonHeaders) {
			route.request = {
				...route.request,
				headers: {
					...options.commonHeaders,
					...route.request?.headers,
				},
			};
		}
	}

	return contract;
};
