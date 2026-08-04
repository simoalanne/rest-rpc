import {
	type RequestKeyResolverOptions,
	resolveSchemaKeysAsync,
	resolveSchemaKeysSync,
} from "./requestKeys.ts";
import type {
	Contract,
	RequestKeys,
	RequestSchema,
	RouteDeclaration,
} from "./route.ts";
import { isCustomBody } from "./route.ts";
import { contractRoutes } from "./traversal.ts";

export type ValidateContractOptions = RequestKeyResolverOptions;

const assertNoDuplicateKeys = (
	route: RouteDeclaration,
	keys: readonly string[],
) => {
	if (keys.length === new Set(keys).size) return;

	throw new Error(
		`Route declaration at path "${route.path}" has duplicate request keys across its "body", "query" and "params" definitions.`,
	);
};

const getPathParams = (route: RouteDeclaration) =>
	[...route.path.matchAll(/:([A-Za-z0-9_]+)/g)].map(
		(match) => match[1] as string,
	);

const assertPathParamsResolved = (route: RouteDeclaration) => {
	const pathParams = getPathParams(route);
	for (const key of pathParams) {
		if (route.request?.requestKeys?.[key] !== "params") {
			throw new Error(
				`Route declaration at path "${route.path}" has a path param "${key}" without a matching params schema key.`,
			);
		}
	}

	const pathParamSet = new Set(pathParams);
	for (const [key, segment] of Object.entries(
		route.request?.requestKeys ?? {},
	)) {
		if (segment === "params" && !pathParamSet.has(key)) {
			throw new Error(
				`Route declaration at path "${route.path}" has a params request key "${key}" without a matching path param.`,
			);
		}
	}
};

const requestSchemas = (request: RequestSchema) =>
	[
		["body", isCustomBody(request.body) ? undefined : request.body],
		["query", request.query],
		["params", request.params],
	] as const;

export const validateResolvedRequestKeys = (route: RouteDeclaration) => {
	const keys = Object.keys(route.request?.requestKeys ?? {});
	assertNoDuplicateKeys(route, keys);

	if (isCustomBody(route.request?.body) && route.request?.requestKeys?.body) {
		throw new Error(
			`Route declaration at path "${route.path}" has a "body" key in query or params. Rename it to avoid conflict with the request body.`,
		);
	}

	assertPathParamsResolved(route);
};

export const validateContractSync = <TContract extends Contract>(
	contract: TContract,
	options?: ValidateContractOptions,
): TContract => {
	for (const route of contractRoutes(contract)) {
		if (!route.request) {
			validateResolvedRequestKeys(route);
			continue;
		}
		if (route.request.requestKeys) {
			validateResolvedRequestKeys(route);
			continue;
		}

		const requestKeys: RequestKeys = {};
		for (const [segment, schema] of requestSchemas(route.request)) {
			if (!schema) continue;
			const keys = resolveSchemaKeysSync(schema, options);
			if (!keys) {
				throw new Error(
					`Could not resolve request keys for ${segment} schema on ${route.method} ${route.path}. Provide request.requestKeys or a resolveRequestKeys option.`,
				);
			}
			assertNoDuplicateKeys(route, [...Object.keys(requestKeys), ...keys]);
			for (const key of keys) requestKeys[key] = segment;
		}
		route.request.requestKeys = requestKeys;
		validateResolvedRequestKeys(route);
	}

	return contract;
};

export const validateContractAsync = async <TContract extends Contract>(
	contract: TContract,
	options?: ValidateContractOptions,
): Promise<TContract> => {
	for (const route of contractRoutes(contract)) {
		if (!route.request) {
			validateResolvedRequestKeys(route);
			continue;
		}
		if (route.request.requestKeys) {
			validateResolvedRequestKeys(route);
			continue;
		}

		const requestKeys: RequestKeys = {};
		for (const [segment, schema] of requestSchemas(route.request)) {
			if (!schema) continue;
			const keys = await resolveSchemaKeysAsync(schema, options);
			if (!keys) {
				throw new Error(
					`Could not resolve request keys for ${segment} schema on ${route.method} ${route.path}. Provide request.requestKeys or a resolveRequestKeys option.`,
				);
			}
			assertNoDuplicateKeys(route, [...Object.keys(requestKeys), ...keys]);
			for (const key of keys) requestKeys[key] = segment;
		}
		route.request.requestKeys = requestKeys;
		validateResolvedRequestKeys(route);
	}

	return contract;
};
