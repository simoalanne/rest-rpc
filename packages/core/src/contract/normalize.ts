import type { Contract, RouteMetadata } from "./route.ts";
import { contractRoutes } from "./traversal.ts";

export type NormalizeContractOptions = {
	pathPrefix?: string;
	prefix?: string;
	metadata?: RouteMetadata;
};

export const joinPathPrefix = (prefix: string, path: string) => {
	const normalizedPrefix = prefix.replace(/\/+$/, "");
	const normalizedPath = path.replace(/^\/+/, "");

	if (!normalizedPrefix) return normalizedPath ? `/${normalizedPath}` : "/";
	if (!normalizedPath) return normalizedPrefix;

	return `${normalizedPrefix}/${normalizedPath}`;
};

export const normalizeContract = <TContract extends Contract>(
	contract: TContract,
	options?: NormalizeContractOptions,
): TContract => {
	for (const route of contractRoutes(contract)) {
		const pathPrefix = options?.prefix ?? options?.pathPrefix;
		if (pathPrefix) {
			route.path = joinPathPrefix(pathPrefix, route.path);
		}

		route.metadata = {
			...options?.metadata,
			...route.metadata,
		};
	}

	return contract;
};
