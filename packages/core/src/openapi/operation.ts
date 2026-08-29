import {
	isCustomBody,
	isFormBody,
	isMultipartBody,
	isNoBody,
	isStream,
} from "../contract/body.ts";
import type {
	HttpRouteDeclaration,
	OpenApiResponseOptions,
} from "../contract/contract.ts";
import type {
	JsonQuery,
	RequestBodySchema,
	RequestSchemaRecord,
} from "../contract/request.ts";
import { isJsonQuery, isRequestSchemaRecord } from "../contract/request.ts";
import type {
	ResponseDeclaration,
	ResponseHeaders,
} from "../contract/response.ts";
import {
	getResponseBody,
	getResponseHeaders,
	getRouteResponses,
} from "../contract/response.ts";
import {
	isStandardSchema,
	type StandardSchemaV1,
} from "../standard-schema/index.ts";

export const JSON_CONTENT_TYPE = "application/json";
export const SSE_CONTENT_TYPE = "text/event-stream";
export const NDJSON_CONTENT_TYPE = "application/x-ndjson";
export const FORM_URLENCODED_CONTENT_TYPE = "application/x-www-form-urlencoded";
export const MULTIPART_FORM_DATA_CONTENT_TYPE = "multipart/form-data";

export type OpenApiSchema = Record<string, unknown>;

export type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	required?: boolean;
	description?: string;
	schema?: OpenApiSchema;
	content?: Record<string, { schema?: OpenApiSchema }>;
};

export type OpenApiRequestBody = {
	required?: boolean;
	description?: string;
	content: Record<string, { schema?: OpenApiSchema }>;
};

export type OpenApiResponse = {
	description: string;
	headers?: Record<string, { description?: string; schema?: OpenApiSchema }>;
	content?: Record<string, { schema?: OpenApiSchema }>;
};

export type OpenApiExternalDocs = {
	url: string;
	description?: string;
};

export type OpenApiOperation = {
	operationId?: string;
	summary?: string;
	description?: string;
	tags?: string[];
	deprecated?: boolean;
	parameters?: OpenApiParameter[];
	requestBody?: OpenApiRequestBody;
	responses: Record<string, OpenApiResponse>;
	security?: Array<Record<string, string[]>>;
	externalDocs?: OpenApiExternalDocs;
	[key: `x-${string}`]: unknown;
};

export type SchemaConverter = (
	schema: StandardSchemaV1,
	mode: "input" | "output",
) => OpenApiSchema | undefined;

export type OpenApiRouteDeclaration = HttpRouteDeclaration;

export type ParameterTransformContext = {
	route: OpenApiRouteDeclaration;
	routePath: readonly string[];
	parameter: OpenApiParameter;
};

export type OperationTransformContext = {
	route: OpenApiRouteDeclaration;
	routePath: readonly string[];
	operation: OpenApiOperation;
};

type CreateOperationOptions = {
	schemaConverter?: SchemaConverter;
	transformParameter?: (context: ParameterTransformContext) => OpenApiParameter;
	transformOperation?: (context: OperationTransformContext) => OpenApiOperation;
};

const getSchemaProperties = (schema: OpenApiSchema) =>
	(schema.properties ?? {}) as Record<string, OpenApiSchema>;

type SchemaRequiredKeys =
	| { type: "known"; keys: unknown[] }
	| { type: "unknown" };

const getRequiredSchemaKeys = (schema: OpenApiSchema): SchemaRequiredKeys => {
	if (Array.isArray(schema.required)) {
		return { type: "known", keys: schema.required };
	}

	if (schema.type === "object" || schema.properties) {
		return { type: "known", keys: [] };
	}

	return { type: "unknown" };
};

const createContent = (
	contentTypes: readonly string[],
	value: Record<string, unknown>,
) =>
	Object.fromEntries(contentTypes.map((contentType) => [contentType, value]));

const contentTypesForCustomBody = (schema: {
	contentType?: string | readonly string[];
}) =>
	schema.contentType === undefined
		? []
		: Array.isArray(schema.contentType)
			? schema.contentType
			: [schema.contentType];

const createSchemaRecordObject = (
	schemas: RequestSchemaRecord,
	converter: SchemaConverter | undefined,
) => {
	return {
		type: "object",
		properties: Object.fromEntries(
			Object.entries(schemas).map(([name, schema]) => [
				name,
				converter?.(schema, "input") ?? {},
			]),
		),
	};
};

export const createParameters = (
	schema: StandardSchemaV1 | RequestSchemaRecord | JsonQuery | undefined,
	location: "path" | "query",
	options: CreateOperationOptions,
): OpenApiParameter[] => {
	if (!schema) return [];

	if (isJsonQuery(schema)) {
		const jsonSchema = options.schemaConverter?.(schema.schema, "input") ?? {};

		return [
			{
				name: "query",
				in: "query",
				content: {
					[JSON_CONTENT_TYPE]: {
						schema: jsonSchema,
					},
				},
			},
		];
	}

	if (isRequestSchemaRecord(schema)) {
		return Object.entries(schema).map(([name, fieldSchema]) => {
			const jsonSchema = options.schemaConverter?.(fieldSchema, "input") ?? {};

			return {
				name,
				in: location,
				...(location === "path" ? { required: true } : {}),
				schema: jsonSchema,
			};
		});
	}

	const jsonSchema = options.schemaConverter?.(schema, "input") ?? {};
	const properties = getSchemaProperties(jsonSchema);
	const requiredKeys = getRequiredSchemaKeys(jsonSchema);

	return Object.entries(properties).map(([name, propertySchema]) => {
		const isRequired =
			requiredKeys.type === "known"
				? requiredKeys.keys.includes(name)
				: undefined;
		return {
			name,
			in: location,
			...(location === "path" ? { required: true } : { required: isRequired }),
			schema: propertySchema,
		};
	});
};

export const createHeaderParameters = (
	headers: Record<string, StandardSchemaV1> | undefined,
	options: CreateOperationOptions,
): OpenApiParameter[] => {
	if (!headers) return [];

	return Object.entries(headers).map(([name, schema]) => {
		const jsonSchema = options.schemaConverter?.(schema, "input") ?? {};

		return {
			name,
			in: "header" as const,
			schema: jsonSchema,
		};
	});
};

export const createRequestBody = (
	schema: RequestBodySchema,
	converter: SchemaConverter | undefined,
): OpenApiRequestBody | undefined => {
	if (!schema) return undefined;
	if (isNoBody(schema)) return undefined;
	const contentTypes = isFormBody(schema)
		? [FORM_URLENCODED_CONTENT_TYPE]
		: isMultipartBody(schema)
			? [MULTIPART_FORM_DATA_CONTENT_TYPE]
			: isCustomBody(schema)
				? contentTypesForCustomBody(schema)
				: [JSON_CONTENT_TYPE];
	if (contentTypes.length === 0) return undefined;
	const bodySchema =
		isCustomBody(schema) || isFormBody(schema) || isMultipartBody(schema)
			? schema.schema
			: schema;
	const openApiSchema = isRequestSchemaRecord(bodySchema)
		? createSchemaRecordObject(bodySchema, converter)
		: isStandardSchema(bodySchema)
			? (converter?.(bodySchema, "input") ?? {})
			: undefined;

	return {
		content: createContent(
			contentTypes,
			openApiSchema ? { schema: openApiSchema } : {},
		),
	};
};

export const createResponse = (
	description: string,
	responseDeclaration: ResponseDeclaration,
	converter: SchemaConverter | undefined,
	openApiResponse?: OpenApiResponseOptions,
): OpenApiResponse => {
	const schema = getResponseBody(responseDeclaration);
	const headers = mergeResponseHeaders(
		createOpenApiResponseHeaders(openApiResponse?.headers, converter),
		createResponseHeaders(getResponseHeaders(responseDeclaration), converter),
	);

	if (isNoBody(schema)) {
		return {
			description: openApiResponse?.description ?? description,
			...(headers ? { headers } : {}),
		};
	}

	if (isStream(schema)) {
		const contentTypes = isCustomBody(schema.schema)
			? contentTypesForCustomBody(schema.schema)
			: [NDJSON_CONTENT_TYPE];

		return {
			description: openApiResponse?.description ?? description,
			...(headers ? { headers } : {}),
			content: Object.fromEntries(
				contentTypes.map((contentType) => [
					contentType,
					{
						schema: createStreamWireSchema(contentType),
					},
				]),
			),
		};
	}

	const contentTypes = isCustomBody(schema)
		? contentTypesForCustomBody(schema)
		: [JSON_CONTENT_TYPE];
	const bodySchema = isCustomBody(schema) ? schema.schema : schema;
	const openApiSchema = converter?.(bodySchema, "output") ?? {};

	return {
		description: openApiResponse?.description ?? description,
		...(headers ? { headers } : {}),
		content: createContent(
			contentTypes,
			openApiSchema ? { schema: openApiSchema } : {},
		),
	};
};

export const createResponseHeaders = (
	headers: ResponseHeaders | undefined,
	converter: SchemaConverter | undefined,
): OpenApiResponse["headers"] | undefined => {
	if (!headers) return undefined;

	return Object.fromEntries(
		Object.entries(headers).map(([name, schema]) => [
			name,
			{
				schema: converter?.(schema, "output") ?? {},
			},
		]),
	);
};

export const createOpenApiResponseHeaders = (
	headers: OpenApiResponseOptions["headers"] | undefined,
	converter: SchemaConverter | undefined,
): OpenApiResponse["headers"] | undefined => {
	if (!headers) return undefined;

	return Object.fromEntries(
		Object.entries(headers).map(([name, header]) => {
			const schema = isStandardSchema(header) ? header : header.schema;
			const description = isStandardSchema(header)
				? undefined
				: header.description;

			return [
				name,
				{
					...(description ? { description } : {}),
					schema: converter?.(schema, "output") ?? {},
				},
			];
		}),
	);
};

const mergeResponseHeaders = (
	openApiHeaders: OpenApiResponse["headers"] | undefined,
	declaredHeaders: OpenApiResponse["headers"] | undefined,
): OpenApiResponse["headers"] | undefined => {
	if (!openApiHeaders && !declaredHeaders) return undefined;
	return {
		...openApiHeaders,
		...declaredHeaders,
	};
};

const createStreamWireSchema = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/octet-stream"
		? { type: "string", format: "binary" }
		: { type: "string" };

export const createResponses = (
	route: OpenApiRouteDeclaration,
	converter: SchemaConverter | undefined,
) => {
	const responses: Record<string, OpenApiResponse> = {};

	for (const [status, schema] of Object.entries(getRouteResponses(route))) {
		const openApiResponse = route.openApi?.responses?.[Number(status)];
		const response = createResponse(
			openApiResponse?.description ?? "",
			schema,
			converter,
			openApiResponse,
		);
		responses[status] =
			route.mode === "sse"
				? {
						...response,
						content: {
							[SSE_CONTENT_TYPE]: { schema: { type: "string" } },
						},
					}
				: response;
	}

	return responses;
};

export const createOperation = (
	route: OpenApiRouteDeclaration,
	options: CreateOperationOptions,
	routePath: readonly string[] = [],
): OpenApiOperation => {
	const parameters = [
		...createParameters(route.pathParams, "path", options),
		...createParameters(route.query, "query", options),
		...createHeaderParameters(route.headers, options),
	].map(
		(parameter) =>
			options.transformParameter?.({ route, routePath, parameter }) ??
			parameter,
	);
	const requestBody = createRequestBody(route.body, options.schemaConverter);
	const { extensions, ...openApi } = route.openApi ?? {};
	const operation: OpenApiOperation = {
		...openApi,
		...extensions,
		...(parameters.length > 0 ? { parameters } : {}),
		...(requestBody ? { requestBody } : {}),
		responses: createResponses(route, options.schemaConverter),
	};

	return (
		options.transformOperation?.({ route, routePath, operation }) ?? operation
	);
};
