import type {
	RequestBodySchema,
	ResponseBodySchema,
} from "../contract/route.ts";
import { isCustomBody, isNoBodyResponse } from "../contract/route.ts";
import type { StandardSchemaV1 } from "../standardSchema.ts";
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

export const createParameters = (
	schema: StandardSchemaV1 | undefined,
	location: "path" | "query",
	converter: SchemaConverter | undefined,
): OpenApiParameter[] => {
	if (!schema) return [];

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

export const createRequestBody = (
	schema: RequestBodySchema,
	converter: SchemaConverter | undefined,
): OpenApiRequestBody | undefined => {
	if (!schema) return undefined;
	const contentType = isCustomBody(schema)
		? schema.contentType
		: JSON_CONTENT_TYPE;
	const bodySchema = isCustomBody(schema) ? schema.schema : schema;

	return {
		required: true,
		content: {
			[contentType]: {
				schema: convertSchema(bodySchema, "input", converter),
			},
		},
	};
};

export const createResponse = (
	description: string,
	schema: ResponseBodySchema,
	converter: SchemaConverter | undefined,
): OpenApiResponse => {
	if (isNoBodyResponse(schema)) return { description };

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
