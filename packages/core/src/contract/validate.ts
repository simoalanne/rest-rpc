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
import { isCustomBody, isNoBody } from "./route.ts";
import { contractRoutes } from "./traversal.ts";

export type ValidateContractOptions = RequestKeyResolverOptions;

const assertNoDuplicateKeys = (
	route: RouteDeclaration,
	keys: readonly string[],
) => {
	if (keys.length === new Set(keys).size) return;

	throw new Error(
		`Route declaration at path "${route.path}" has duplicate request keys across its "body", "query", "params" and "headers" definitions.`,
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
		[
			"body",
			isCustomBody(request.body) || isNoBody(request.body)
				? undefined
				: request.body,
		],
		["query", request.query],
		["params", request.params],
	] as const;

const applyHeaderRequestKeys = (route: RouteDeclaration) => {
	const headers = route.request?.headers;
	const requestKeys = route.request?.requestKeys;
	if (!headers || !requestKeys) return;

	for (const key of Object.keys(headers)) {
		const existingSegment = requestKeys[key];
		if (existingSegment && existingSegment !== "headers") {
			assertNoDuplicateKeys(route, [key, key]);
		}
		requestKeys[key] = "headers";
	}
};

export const validateResolvedRequestKeys = (route: RouteDeclaration) => {
	applyHeaderRequestKeys(route);
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
		for (const key of Object.keys(route.request.headers ?? {})) {
			assertNoDuplicateKeys(route, [...Object.keys(requestKeys), key]);
			requestKeys[key] = "headers";
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
		for (const key of Object.keys(route.request.headers ?? {})) {
			assertNoDuplicateKeys(route, [...Object.keys(requestKeys), key]);
			requestKeys[key] = "headers";
		}
		route.request.requestKeys = requestKeys;
		validateResolvedRequestKeys(route);
	}

	return contract;
};
