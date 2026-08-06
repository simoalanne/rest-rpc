import type {
	RequestBodySchema,
	RequestSchemaRecord,
	ResponseBodySchema,
} from "../contract/route.ts";
import {
	isCustomBody,
	isNoBody,
	isRequestSchemaRecord,
	isStandardSchema,
} from "../contract/route.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	convertSchema,
	getRequiredSchemaKeys,
	getSchemaProperties,
} from "./schemas.ts";
import type {
	CreateOpenApiDocumentOptions,
	OpenApiOperation,
	OpenApiParameter,
	OpenApiRequestBody,
	OpenApiResponse,
	OpenApiRouteDeclaration,
	SchemaConverter,
} from "./types.ts";

export const JSON_CONTENT_TYPE = "application/json";

const createSchemaRecordObject = (
	schemas: RequestSchemaRecord,
	converter: SchemaConverter | undefined,
) => ({
	type: "object",
	properties: Object.fromEntries(
		Object.entries(schemas).map(([name, schema]) => [
			name,
			convertSchema(schema, "input", converter),
		]),
	),
});

export const createParameters = (
	schema: StandardSchemaV1 | RequestSchemaRecord | undefined,
	location: "path" | "query",
	converter: SchemaConverter | undefined,
): OpenApiParameter[] => {
	if (!schema) return [];

	if (isRequestSchemaRecord(schema)) {
		return Object.entries(schema).map(([name, fieldSchema]) => ({
			name,
			in: location,
			required: location === "path" ? true : undefined,
			schema: convertSchema(fieldSchema, "input", converter),
		}));
	}

	const jsonSchema = convertSchema(schema, "input", converter);
	const properties = getSchemaProperties(jsonSchema);
	const requiredKeys = getRequiredSchemaKeys(jsonSchema);

	return Object.entries(properties).map(([name, propertySchema]) => ({
		name,
		in: location,
		required: location === "path" ? true : requiredKeys.has(name),
		schema: propertySchema,
	}));
};

export const createHeaderParameters = (
	headers: Record<string, StandardSchemaV1> | undefined,
	converter: SchemaConverter | undefined,
): OpenApiParameter[] => {
	if (!headers) return [];

	return Object.entries(headers).map(([name, schema]) => ({
		name,
		in: "header",
		schema: convertSchema(schema, "input", converter),
	}));
};

export const createRequestBody = (
	schema: RequestBodySchema,
	converter: SchemaConverter | undefined,
): OpenApiRequestBody | undefined => {
	if (!schema) return undefined;
	if (isNoBody(schema)) return undefined;
	const contentType = isCustomBody(schema)
		? schema.contentType
		: JSON_CONTENT_TYPE;
	const bodySchema = isCustomBody(schema) ? schema.schema : schema;
	const openApiSchema = isRequestSchemaRecord(bodySchema)
		? createSchemaRecordObject(bodySchema, converter)
		: isStandardSchema(bodySchema)
			? convertSchema(bodySchema, "input", converter)
			: undefined;
	if (!openApiSchema) return undefined;

	return {
		required: true,
		content: {
			[contentType]: {
				schema: openApiSchema,
			},
		},
	};
};

export const createResponse = (
	description: string,
	schema: ResponseBodySchema,
	converter: SchemaConverter | undefined,
): OpenApiResponse => {
	if (isNoBody(schema)) return { description };

	return {
		description,
		content: {
			[JSON_CONTENT_TYPE]: {
				schema: convertSchema(schema as StandardSchemaV1, "output", converter),
			},
		},
	};
};

export const createResponses = (
	route: OpenApiRouteDeclaration,
	converter: SchemaConverter | undefined,
) => {
	const responses: Record<string, OpenApiResponse> = {};

	for (const [status, schema] of Object.entries(route.responses)) {
		responses[status] = createResponse(
			Number(status) >= 200 && Number(status) < 300 ? "Success" : "Error",
			schema,
			converter,
		);
	}

	return responses;
};

export const createOperation = (
	route: OpenApiRouteDeclaration,
	options: CreateOpenApiDocumentOptions,
): OpenApiOperation => {
	const parameters = [
		...createParameters(route.request?.params, "path", options.schemaConverter),
		...createParameters(route.request?.query, "query", options.schemaConverter),
		...createHeaderParameters(route.request?.headers, options.schemaConverter),
	];
	const requestBody = createRequestBody(
		route.request?.body,
		options.schemaConverter,
	);
	const operation: OpenApiOperation = {
		...(parameters.length > 0 ? { parameters } : {}),
		...(requestBody ? { requestBody } : {}),
		responses: createResponses(route, options.schemaConverter),
	};

	return options.transformOperation?.({ route, operation }) ?? operation;
};
