import type { OpenApiResponseOptions } from "../contract/routeDeclaration.ts";
import type { RouteDeclaration } from "../contract/routeDeclaration.ts";
import type { RequestBodySchema } from "../contract/request.ts";
import type {
	ResponseDeclaration,
	ResponseHeaders,
} from "../contract/response.ts";
import { contentTypeList } from "../codecs/index.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";

const JSON_CONTENT_TYPE = "application/json";
const SSE_CONTENT_TYPE = "text/event-stream";

type OpenApiSchema = Record<string, unknown>;

export type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	required?: boolean;
	description?: string;
	schema?: OpenApiSchema;
	content?: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiRequestBody = {
	required?: boolean;
	description?: string;
	content: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiResponse = {
	description: string;
	headers?: Record<string, { description?: string; schema?: OpenApiSchema }>;
	content?: Record<string, { schema?: OpenApiSchema }>;
};

type OpenApiExternalDocs = {
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

export type ParameterTransformContext = {
	route: RouteDeclaration;
	routePath: readonly string[];
	parameter: OpenApiParameter;
};

export type OperationTransformContext = {
	route: RouteDeclaration;
	routePath: readonly string[];
	operation: OpenApiOperation;
};

type CreateOperationOptions = {
	schemaConverter?: SchemaConverter;
	transformParameter?: (context: ParameterTransformContext) => OpenApiParameter;
	transformOperation?: (context: OperationTransformContext) => OpenApiOperation;
};

const getSchemaProperties = (schema: OpenApiSchema) => {
	const properties = schema.properties;
	return typeof properties === "object" &&
		properties !== null &&
		!Array.isArray(properties)
		? (properties as Record<string, OpenApiSchema>)
		: {};
};

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

export const createParameters = (
	schemas: readonly StandardSchemaV1[] | undefined,
	location: "path" | "query" | "header",
	options: CreateOperationOptions,
): OpenApiParameter[] => {
	if (!schemas) return [];

	const properties: Record<string, OpenApiSchema> = {};
	const requiredKeys = new Set<unknown>();
	for (const schema of schemas) {
		const jsonSchema = options.schemaConverter?.(schema, "input") ?? {};
		for (const [name, propertySchema] of Object.entries(
			getSchemaProperties(jsonSchema),
		)) {
			properties[name] = properties[name]
				? { allOf: [properties[name], propertySchema] }
				: propertySchema;
		}
		const schemaRequiredKeys = getRequiredSchemaKeys(jsonSchema);
		if (schemaRequiredKeys.type === "known") {
			for (const name of schemaRequiredKeys.keys) requiredKeys.add(name);
		}
	}

	return Object.entries(properties).map(([name, propertySchema]) => {
		return {
			name,
			in: location,
			...(location === "path"
				? { required: true }
				: { required: requiredKeys.has(name) }),
			schema: propertySchema,
		};
	});
};

export const createRequestBody = (
	schemas: readonly RequestBodySchema[] | undefined,
	converter: SchemaConverter | undefined,
	customContentType?: string | readonly string[],
): OpenApiRequestBody | undefined => {
	if (!schemas || schemas.length === 0) return undefined;
	const contentTypes = contentTypeList(customContentType ?? JSON_CONTENT_TYPE);
	if (contentTypes.length === 0) return undefined;
	const convertedSchemas = schemas.map(
		(schema) => converter?.(schema, "input") ?? {},
	);
	const openApiSchema =
		convertedSchemas.length === 1
			? convertedSchemas[0]
			: { allOf: convertedSchemas };

	return {
		content: createContent(contentTypes, { schema: openApiSchema }),
	};
};

export const createResponse = (
	description: string,
	responseDeclaration: ResponseDeclaration,
	converter: SchemaConverter | undefined,
	openApiResponse?: OpenApiResponseOptions,
): OpenApiResponse => {
	const {
		body: schema,
		contentType,
		headers: declaredHeaders,
	} = responseDeclaration;
	const headers = mergeResponseHeaders(
		createOpenApiResponseHeaders(openApiResponse?.headers, converter),
		createResponseHeaders(declaredHeaders, converter),
	);
	const response: OpenApiResponse = {
		description: openApiResponse?.description ?? description,
		...(headers ? { headers } : {}),
	};
	if (schema === undefined) return response;

	const contentTypes =
		responseDeclaration.kind === "stream"
			? [SSE_CONTENT_TYPE]
			: contentTypeList(contentType ?? JSON_CONTENT_TYPE);

	return {
		...response,
		content: createContent(contentTypes, {
			schema: converter?.(schema, "output") ?? {},
		}),
	};
};

const createResponseHeaders = (
	headers: ResponseHeaders | undefined,
	converter: SchemaConverter | undefined,
): OpenApiResponse["headers"] | undefined => {
	if (!headers) return undefined;

	const schema = converter?.(headers, "output") ?? {};
	return Object.fromEntries(
		Object.entries(getSchemaProperties(schema)).map(
			([name, propertySchema]) => [name, { schema: propertySchema }],
		),
	);
};

const createOpenApiResponseHeaders = (
	headers: OpenApiResponseOptions["headers"] | undefined,
	converter: SchemaConverter | undefined,
): OpenApiResponse["headers"] | undefined => {
	if (!headers) return undefined;

	return Object.fromEntries(
		Object.entries(headers).map(([name, header]) => {
			const isSchema = "~standard" in header;
			const schema = isSchema ? header : header.schema;
			const description = isSchema ? undefined : header.description;

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

const createResponses = (
	route: RouteDeclaration,
	converter: SchemaConverter | undefined,
) => {
	const declared = Object.entries(route.responses);
	// Responses inferred from a handler have no schema. `default` documents them
	// without claiming a status, and keeps the required Responses Object non-empty.
	if (declared.length === 0) {
		return {
			default: {
				description:
					"Response inferred from the route handler; not documented.",
			},
		};
	}

	const responses: Record<string, OpenApiResponse> = {};
	for (const [status, schema] of declared) {
		responses[status] = createResponse(
			"",
			schema,
			converter,
			route.openApi?.responses?.[Number(status)],
		);
	}

	return responses;
};

export const createOperation = (
	route: RouteDeclaration,
	options: CreateOperationOptions,
	routePath: readonly string[] = [],
): OpenApiOperation => {
	const request = route.request;
	const parameters = [
		...createParameters(request?.params, "path", options),
		...createParameters(request?.query, "query", options),
		...createParameters(request?.headers, "header", options),
	].map(
		(parameter) =>
			options.transformParameter?.({ route, routePath, parameter }) ??
			parameter,
	);
	const requestBody = createRequestBody(
		request?.body,
		options.schemaConverter,
		request?.contentType,
	);
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
