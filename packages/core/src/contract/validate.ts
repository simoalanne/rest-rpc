import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { validateStandardSchemaSync } from "../standard-schema/index.ts";
import {
	type RequestKeyResolverOptions,
	resolveSchemaKeysAsync,
	resolveSchemaKeysSync,
} from "./requestKeys.ts";
import type {
	Contract,
	RequestKeys,
	RequestSchema,
	RequestSegment,
	RouteDeclaration,
} from "./route.ts";
import {
	isCustomBody,
	isNoBody,
	isRequestSchemaRecord,
	isStandardSchema,
	REQUEST_CONTEXT_KEY,
} from "./route.ts";
import { contractRoutes } from "./traversal.ts";

export type ValidateContractOptions = RequestKeyResolverOptions;

export type FlatRequestInput = Record<string, unknown>;

export type GroupedRequestInput = {
	body?: unknown;
	query?: Record<string, unknown>;
	params?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

export type GroupRequestInputOptions = {
	unknownRequestKeys?: "throw" | "strip";
};

export type RequestValidationResult =
	| { success: true; data: FlatRequestInput }
	| { success: false; errors: StandardSchemaV1.Issue[] };

const requestSegments = ["body", "query", "params", "headers"] as const;
export const pathParamPattern = /:([A-Za-z0-9_]+)/g;

const assertNoDuplicateKeys = (
	route: RouteDeclaration,
	keys: readonly string[],
) => {
	if (keys.length === new Set(keys).size) return;

	throw new Error(
		`Route declaration at path "${route.path}" has duplicate request keys across its "body", "query", "params" and "headers" definitions.`,
	);
};

const assertNoReservedRequestKeys = (route: RouteDeclaration) => {
	if (route.request?.requestKeys?.[REQUEST_CONTEXT_KEY] === undefined) return;

	throw new Error(
		`Route declaration at path "${route.path}" has a reserved request key "${REQUEST_CONTEXT_KEY}". Rename it to avoid conflict with the route handler context.`,
	);
};

const getHeaderRequestKeys = (route: RouteDeclaration) => [
	...new Set([
		...Object.keys(route.request?.headers ?? {}),
		...Object.entries(route.request?.requestKeys ?? {})
			.filter(([, segment]) => segment === "headers")
			.map(([key]) => key),
	]),
];

const assertNoReservedHeaderKeys = (route: RouteDeclaration) => {
	for (const key of getHeaderRequestKeys(route)) {
		if (key.toLowerCase() !== "content-type") continue;

		throw new Error(
			`Route declaration at path "${route.path}" has a reserved header key "${key}". Use customBody({ contentType }) to declare request content type instead.`,
		);
	}
};

const assertNoCaseInsensitiveHeaderDuplicates = (route: RouteDeclaration) => {
	const normalized = new Set<string>();
	for (const key of getHeaderRequestKeys(route)) {
		const normalizedKey = key.toLowerCase();
		if (normalized.has(normalizedKey)) {
			throw new Error(
				`Route declaration at path "${route.path}" has duplicate header keys that differ only by case.`,
			);
		}
		normalized.add(normalizedKey);
	}
};

const getPathParams = (route: RouteDeclaration) =>
	[...route.path.matchAll(pathParamPattern)].map((match) => match[1] as string);

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

const assertOpenApiResponseDescriptionsMatchResponses = (
	route: RouteDeclaration,
) => {
	if (!route.responses || !route.openApi?.responseDescriptions) return;

	const responseStatuses = new Set(Object.keys(route.responses));
	for (const status of Object.keys(route.openApi.responseDescriptions)) {
		if (responseStatuses.has(status)) continue;

		throw new Error(
			`Route declaration at path "${route.path}" has an OpenAPI response description for status ${status} without a matching response schema.`,
		);
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
	assertOpenApiResponseDescriptionsMatchResponses(route);
	applyHeaderRequestKeys(route);
	const keys = Object.keys(route.request?.requestKeys ?? {});
	assertNoDuplicateKeys(route, keys);
	assertNoReservedRequestKeys(route);
	assertNoReservedHeaderKeys(route);
	assertNoCaseInsensitiveHeaderDuplicates(route);

	if (isCustomBody(route.request?.body) && route.request?.requestKeys?.body) {
		throw new Error(
			`Route declaration at path "${route.path}" has a "body" key in query or params. Rename it to avoid conflict with the request body.`,
		);
	}

	assertPathParamsResolved(route);
};

export const groupRequestInput = (
	route: RouteDeclaration,
	input: FlatRequestInput,
	options: GroupRequestInputOptions = {},
): GroupedRequestInput => {
	const unknownRequestKeys = options.unknownRequestKeys ?? "throw";
	const isCustomRequestBody = isCustomBody(route.request?.body);
	const requestKeys = route.request?.requestKeys;

	if (!requestKeys && route.request) {
		throw new Error(
			`Missing request key metadata for ${route.method} ${route.path}. Call router() or provide request.requestKeys before grouping request input.`,
		);
	}

	return Object.entries(input).reduce((grouped, [key, value]) => {
		if (key === "body" && isCustomRequestBody) {
			grouped.body = value;
			return grouped;
		}

		const segment = requestKeys?.[key];
		if (segment) {
			if (!grouped[segment]) grouped[segment] = {};
			(grouped[segment] as Record<string, unknown>)[key] = value;
			return grouped;
		}

		if (unknownRequestKeys === "strip") return grouped;

		throw new Error(
			`Unknown request key "${key}" for ${route.method} ${route.path}.`,
		);
	}, {} as GroupedRequestInput);
};

const assignFlatObject = (data: FlatRequestInput, value: unknown) => {
	if (typeof value === "object" && value !== null) {
		Object.assign(data, value);
	}
};

const validateSchemaRecord = (
	schemas: Record<string, StandardSchemaV1>,
	value: unknown,
	data: FlatRequestInput,
	errors: StandardSchemaV1.Issue[],
) => {
	const input = value as Record<string, unknown> | undefined;
	for (const [key, schema] of Object.entries(schemas)) {
		const result = validateStandardSchemaSync(schema, input?.[key]);
		if (result.issues) {
			errors.push(...result.issues);
			continue;
		}
		data[key] = result.value;
	}
};

const validateFlatRequestSegment = (
	route: RouteDeclaration,
	segment: RequestSegment,
	grouped: GroupedRequestInput,
	data: FlatRequestInput,
	errors: StandardSchemaV1.Issue[],
) => {
	const declaration = route.request?.[segment];
	if (!declaration || isNoBody(declaration)) return;

	if (isCustomBody(declaration)) {
		const result = validateStandardSchemaSync(declaration.schema, grouped.body);
		if (result.issues) {
			errors.push(...result.issues);
			return;
		}
		data.body = result.value;
		return;
	}

	if (isStandardSchema(declaration)) {
		const result = validateStandardSchemaSync(declaration, grouped[segment]);
		if (result.issues) {
			errors.push(...result.issues);
			return;
		}
		assignFlatObject(data, result.value);
		return;
	}

	if (isRequestSchemaRecord(declaration)) {
		validateSchemaRecord(declaration, grouped[segment], data, errors);
	}
};

const resolveRequestKeysForSchemaSync = (
	route: RouteDeclaration,
	segment: "body" | "query" | "params",
	schema: StandardSchemaV1 | Record<string, StandardSchemaV1>,
	options?: ValidateContractOptions,
) => {
	if (isRequestSchemaRecord(schema)) return Object.keys(schema);

	const keys = resolveSchemaKeysSync(schema, options);
	if (!keys) {
		throw new Error(
			`Could not resolve request keys for ${segment} schema on ${route.method} ${route.path}. Provide request.requestKeys or a resolveRequestKeys option.`,
		);
	}
	return keys;
};

const resolveRequestKeysForSchemaAsync = async (
	route: RouteDeclaration,
	segment: "body" | "query" | "params",
	schema: StandardSchemaV1 | Record<string, StandardSchemaV1>,
	options?: ValidateContractOptions,
) => {
	if (isRequestSchemaRecord(schema)) return Object.keys(schema);

	const keys = await resolveSchemaKeysAsync(schema, options);
	if (!keys) {
		throw new Error(
			`Could not resolve request keys for ${segment} schema on ${route.method} ${route.path}. Provide request.requestKeys or a resolveRequestKeys option.`,
		);
	}
	return keys;
};

export const validateFlatRequestInput = (
	route: RouteDeclaration,
	input: FlatRequestInput,
): RequestValidationResult => {
	const data: FlatRequestInput = {};
	const errors: StandardSchemaV1.Issue[] = [];
	const grouped = groupRequestInput(route, input, {
		unknownRequestKeys: "strip",
	});

	for (const segment of requestSegments) {
		validateFlatRequestSegment(route, segment, grouped, data, errors);
	}

	if (errors.length > 0) {
		return { success: false, errors };
	}

	return { success: true, data };
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
			const keys = resolveRequestKeysForSchemaSync(
				route,
				segment,
				schema,
				options,
			);
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
			const keys = await resolveRequestKeysForSchemaAsync(
				route,
				segment,
				schema,
				options,
			);
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
