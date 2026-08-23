import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { validateStandardSchema } from "../standard-schema/index.ts";
import type { Contract, RouteDeclaration } from "./contract.ts";
import { getPathParamNames } from "./path.ts";
import type { RequestKeys, RequestSegment } from "./request.ts";
import {
	isJsonQuery,
	isRequestSchemaRecord,
	isStandardSchema,
	REQUEST_CONTEXT_KEY,
} from "./request.ts";
import {
	type RequestKeyResolverOptions,
	resolveSchemaKeys,
} from "./requestKeys.ts";
import {
	getResponseHeaders,
	getRouteResponses,
	isCustomBody,
	isNoBody,
} from "./response.ts";
import { contractRoutes } from "./traversal.ts";

export type ValidateContractOptions = RequestKeyResolverOptions;

export type FlatRequestInput = Record<string, unknown>;

export type GroupedRequestInput = {
	body?: unknown;
	query?: unknown;
	pathParams?: Record<string, unknown>;
	headers?: Record<string, unknown>;
};

export type GroupRequestInputOptions = {
	strictRequestKeys?: boolean;
};

export type RequestValidationResult =
	| { success: true; data: FlatRequestInput }
	| { success: false; errors: StandardSchemaV1.Issue[] };

const requestSegments = ["body", "query", "pathParams", "headers"] as const;

const takesRouteInput = (route: RouteDeclaration) =>
	Boolean(route.body || route.query || route.pathParams || route.headers);

const assertNoDuplicateKeys = (
	route: RouteDeclaration,
	keys: readonly string[],
) => {
	if (keys.length === new Set(keys).size) return;

	throw new Error(
		`Route declaration at path "${route.path}" has duplicate request keys across its "body", "query", "pathParams" and "headers" definitions.`,
	);
};

const assertNoReservedRequestKeys = (route: RouteDeclaration) => {
	if (route.requestKeys?.[REQUEST_CONTEXT_KEY] === undefined) return;

	throw new Error(
		`Route declaration at path "${route.path}" has a reserved request key "${REQUEST_CONTEXT_KEY}". Rename it to avoid conflict with the route handler context.`,
	);
};

const getHeaderRequestKeys = (route: RouteDeclaration) => [
	...new Set([
		...Object.keys(route.headers ?? {}),
		...Object.entries(route.requestKeys ?? {})
			.filter(([, segment]) => segment === "headers")
			.map(([key]) => key),
	]),
];

const assertNoReservedHeaderKeys = (route: RouteDeclaration) => {
	for (const key of getHeaderRequestKeys(route)) {
		if (key.toLowerCase() !== "content-type") continue;

		throw new Error(
			`Route declaration at path "${route.path}" has a reserved header key "${key}". Use customBody({ schema, contentType }) to declare request content type instead.`,
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

const getResponseHeaderKeys = (route: RouteDeclaration) => [
	...new Set(
		Object.values(route.responses ?? {}).flatMap((response) =>
			Object.keys(getResponseHeaders(response) ?? {}),
		),
	),
];

const assertNoReservedResponseHeaderKeys = (route: RouteDeclaration) => {
	for (const key of getResponseHeaderKeys(route)) {
		if (key.toLowerCase() !== "content-type") continue;

		throw new Error(
			`Route declaration at path "${route.path}" has a reserved response header key "${key}". Use customBody({ schema, contentType }) to declare response content type instead.`,
		);
	}
};

const assertNoCaseInsensitiveResponseHeaderDuplicates = (
	route: RouteDeclaration,
) => {
	for (const response of Object.values(route.responses ?? {})) {
		const normalized = new Set<string>();
		for (const key of Object.keys(getResponseHeaders(response) ?? {})) {
			const normalizedKey = key.toLowerCase();
			if (normalized.has(normalizedKey)) {
				throw new Error(
					`Route declaration at path "${route.path}" has duplicate response header keys that differ only by case.`,
				);
			}
			normalized.add(normalizedKey);
		}
	}
};

const assertPathParamsResolved = (route: RouteDeclaration) => {
	const pathParams = getPathParamNames(route.path);
	for (const key of pathParams) {
		if (route.requestKeys?.[key] !== "pathParams") {
			throw new Error(
				`Route declaration at path "${route.path}" has a path param "${key}" without a matching pathParams schema key.`,
			);
		}
	}

	const pathParamSet = new Set(pathParams);
	for (const [key, segment] of Object.entries(route.requestKeys ?? {})) {
		if (segment === "pathParams" && !pathParamSet.has(key)) {
			throw new Error(
				`Route declaration at path "${route.path}" has a pathParams request key "${key}" without a matching path param.`,
			);
		}
	}
};

const requestSchemas = (route: RouteDeclaration) =>
	[
		[
			"body",
			isCustomBody(route.body) || isNoBody(route.body) ? undefined : route.body,
		],
		["query", isJsonQuery(route.query) ? undefined : route.query],
		["pathParams", route.pathParams],
	] as const;

const applyHeaderRequestKeys = (route: RouteDeclaration) => {
	const headers = route.headers;
	const requestKeys = route.requestKeys;
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
	if (route.responses) getRouteResponses(route);
	applyHeaderRequestKeys(route);
	const keys = Object.keys(route.requestKeys ?? {});
	assertNoDuplicateKeys(route, keys);
	assertNoReservedRequestKeys(route);
	assertNoReservedHeaderKeys(route);
	assertNoCaseInsensitiveHeaderDuplicates(route);
	assertNoReservedResponseHeaderKeys(route);
	assertNoCaseInsensitiveResponseHeaderDuplicates(route);

	if (isCustomBody(route.body) && route.requestKeys?.body) {
		throw new Error(
			`Route declaration at path "${route.path}" has a "body" key in query or pathParams. Rename it to avoid conflict with the request body.`,
		);
	}

	if (isJsonQuery(route.query) && route.requestKeys?.query) {
		throw new Error(
			`Route declaration at path "${route.path}" has a "query" key in body, pathParams or headers. Rename it to avoid conflict with the JSON query value.`,
		);
	}

	assertPathParamsResolved(route);
};

export const groupRequestInput = (
	route: RouteDeclaration,
	input: FlatRequestInput,
	options: GroupRequestInputOptions = {},
): GroupedRequestInput => {
	const strictRequestKeys = options.strictRequestKeys ?? true;
	const isCustomRequestBody = isCustomBody(route.body);
	const isJsonQueryRequest = isJsonQuery(route.query);
	const requestKeys = route.requestKeys;

	if (!requestKeys && takesRouteInput(route)) {
		throw new Error(
			`Missing request key metadata for ${route.method} ${route.path}. Call router() or provide requestKeys before grouping request input.`,
		);
	}

	return Object.entries(input).reduce((grouped, [key, value]) => {
		if (key === "body" && isCustomRequestBody) {
			grouped.body = value;
			return grouped;
		}

		if (key === "query" && isJsonQueryRequest) {
			grouped.query = value;
			return grouped;
		}

		const segment = requestKeys?.[key];
		if (segment) {
			if (!grouped[segment]) grouped[segment] = {};
			(grouped[segment] as Record<string, unknown>)[key] = value;
			return grouped;
		}

		if (!strictRequestKeys) return grouped;

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

const validateSchemaRecord = async (
	schemas: Record<string, StandardSchemaV1>,
	value: unknown,
	data: FlatRequestInput,
	errors: StandardSchemaV1.Issue[],
): Promise<void> => {
	const input = value as Record<string, unknown> | undefined;
	for (const [key, schema] of Object.entries(schemas)) {
		const result = await validateStandardSchema(schema, input?.[key]);
		if (result.issues) {
			errors.push(...result.issues);
			continue;
		}
		data[key] = result.value;
	}
};

const normalizeContentType = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase();

const getDeclaredContentType = (
	contentTypes: readonly string[],
	contentType: string,
) => {
	const normalized = normalizeContentType(contentType);
	return contentTypes.find(
		(value) => normalizeContentType(value) === normalized,
	);
};

const validateCustomBodyPayload = async (
	schema: StandardSchemaV1,
	body: unknown,
	data: FlatRequestInput,
	errors: StandardSchemaV1.Issue[],
	contentTypes: readonly string[] | undefined,
) => {
	const input = body as
		| { contentType?: unknown; payload?: unknown }
		| undefined;
	const contentType =
		contentTypes && typeof input?.contentType === "string"
			? getDeclaredContentType(contentTypes, input.contentType)
			: undefined;

	if (contentTypes && !contentType) {
		errors.push({ message: "Unsupported custom body contentType." });
		return;
	}

	const result = await validateStandardSchema(
		schema,
		contentTypes ? input?.payload : body,
	);
	if (result.issues) {
		errors.push(...result.issues);
		return;
	}

	data.body = contentTypes
		? {
				contentType,
				payload: result.value,
			}
		: result.value;
};

const validateFlatRequestSegment = async (
	route: RouteDeclaration,
	segment: RequestSegment,
	grouped: GroupedRequestInput,
	data: FlatRequestInput,
	errors: StandardSchemaV1.Issue[],
): Promise<void> => {
	const declaration = route[segment];
	if (!declaration || isNoBody(declaration)) return;

	if (isCustomBody(declaration)) {
		await validateCustomBodyPayload(
			declaration.schema,
			grouped.body,
			data,
			errors,
			Array.isArray(declaration.contentType)
				? declaration.contentType
				: undefined,
		);
		return;
	}

	if (isJsonQuery(declaration)) {
		const result = await validateStandardSchema(
			declaration.schema,
			grouped.query,
		);
		if (result.issues) {
			errors.push(...result.issues);
			return;
		}
		data.query = result.value;
		return;
	}

	if (isStandardSchema(declaration)) {
		const result = await validateStandardSchema(declaration, grouped[segment]);
		if (result.issues) {
			errors.push(...result.issues);
			return;
		}
		assignFlatObject(data, result.value);
		return;
	}

	if (isRequestSchemaRecord(declaration)) {
		await validateSchemaRecord(declaration, grouped[segment], data, errors);
	}
};

const resolveRequestKeysForSchemaSync = (
	route: RouteDeclaration,
	segment: "body" | "query" | "pathParams",
	schema: StandardSchemaV1 | Record<string, StandardSchemaV1>,
	options?: ValidateContractOptions,
) => {
	if (isRequestSchemaRecord(schema)) return Object.keys(schema);

	const keys = resolveSchemaKeys(schema, options);
	if (!keys) {
		throw new Error(
			`Could not resolve request keys for ${segment} schema on ${route.method} ${route.path}. Provide requestKeys or a resolveRequestKeys option.`,
		);
	}
	return keys;
};

export const validateFlatRequestInput = async (
	route: RouteDeclaration,
	input: FlatRequestInput,
): Promise<RequestValidationResult> => {
	const data: FlatRequestInput = {};
	const errors: StandardSchemaV1.Issue[] = [];
	const grouped = groupRequestInput(route, input, {
		strictRequestKeys: false,
	});

	for (const segment of requestSegments) {
		await validateFlatRequestSegment(route, segment, grouped, data, errors);
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
		if (!takesRouteInput(route)) {
			validateResolvedRequestKeys(route);
			continue;
		}
		if (route.requestKeys) {
			validateResolvedRequestKeys(route);
			continue;
		}

		const requestKeys: RequestKeys = {};
		for (const [segment, schema] of requestSchemas(route)) {
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
		for (const key of Object.keys(route.headers ?? {})) {
			assertNoDuplicateKeys(route, [...Object.keys(requestKeys), key]);
			requestKeys[key] = "headers";
		}
		route.requestKeys = requestKeys;
		validateResolvedRequestKeys(route);
	}

	return contract;
};
