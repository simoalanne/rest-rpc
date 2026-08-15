import type {
	RequestBodySchema,
	RequestSchemaRecord,
} from "../contract/request.ts";
import {
	isRequestSchemaRecord,
	isStandardSchema,
} from "../contract/request.ts";
import type { ResponseBodySchema } from "../contract/response.ts";
import {
	getRouteResponses,
	isCustomBody,
	isNoBody,
	isStream,
} from "../contract/response.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import {
	convertSchema,
	getRequiredSchemaKeys,
	getSchemaProperties,
	isSchemaOptional,
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
export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

const createSchemaRecordObject = (
	schemas: RequestSchemaRecord,
	converter: SchemaConverter,
) => {
	const required = Object.entries(schemas)
		.filter(([, schema]) => !isSchemaOptional(schema))
		.map(([name]) => name);

	return {
		type: "object",
		properties: Object.fromEntries(
			Object.entries(schemas).map(([name, schema]) => [
				name,
				convertSchema(schema, "input", converter),
			]),
		),
		...(required.length > 0 ? { required } : {}),
	};
};

const assertRequiredPathParameter = (
	name: string,
	routePath: string | undefined,
	isRequired: boolean,
) => {
	if (!isRequired) {
		throw new Error(
			`OpenAPI path parameter "${name}"${routePath ? ` on ${routePath}` : ""} must be required. Make the pathParams schema require this field.`,
		);
	}
};

export const createParameters = (
	schema: StandardSchemaV1 | RequestSchemaRecord | undefined,
	location: "path" | "query",
	converter: SchemaConverter,
	routePath?: string,
): OpenApiParameter[] => {
	if (!schema) return [];

	if (isRequestSchemaRecord(schema)) {
		return Object.entries(schema).map(([name, fieldSchema]) => {
			const isRequired = !isSchemaOptional(fieldSchema);
			if (location === "path") {
				assertRequiredPathParameter(name, routePath, isRequired);
			}

			return {
				name,
				in: location,
				required: isRequired,
				schema: convertSchema(fieldSchema, "input", converter),
			};
		});
	}

	const jsonSchema = convertSchema(schema, "input", converter);
	const properties = getSchemaProperties(jsonSchema);
	const requiredKeys = getRequiredSchemaKeys(jsonSchema);

	return Object.entries(properties).map(([name, propertySchema]) => {
		const isRequired = requiredKeys.has(name);
		if (location === "path") {
			assertRequiredPathParameter(name, routePath, isRequired);
		}

		return {
			name,
			in: location,
			required: isRequired,
			schema: propertySchema,
		};
	});
};

export const createHeaderParameters = (
	headers: Record<string, StandardSchemaV1> | undefined,
	converter: SchemaConverter,
): OpenApiParameter[] => {
	if (!headers) return [];

	return Object.entries(headers).map(([name, schema]) => ({
		name,
		in: "header",
		required: !isSchemaOptional(schema),
		schema: convertSchema(schema, "input", converter),
	}));
};

export const createRequestBody = (
	schema: RequestBodySchema,
	converter: SchemaConverter,
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

	return {
		required: true,
		content: {
			[contentType]: {
				...(openApiSchema ? { schema: openApiSchema } : {}),
			},
		},
	};
};

export const createResponse = (
	description: string,
	schema: ResponseBodySchema,
	converter: SchemaConverter,
): OpenApiResponse => {
	if (isNoBody(schema)) return { description };

	if (isStream(schema)) {
		const contentType = isCustomBody(schema.schema)
			? schema.schema.contentType
			: NDJSON_CONTENT_TYPE;

		return {
			description,
			content: {
				[contentType]: {
					schema: createStreamWireSchema(contentType),
				},
			},
		};
	}

	const contentType = isCustomBody(schema)
		? schema.contentType
		: JSON_CONTENT_TYPE;
	const bodySchema = isCustomBody(schema) ? schema.schema : schema;
	const openApiSchema = isStandardSchema(bodySchema)
		? convertSchema(bodySchema, "output", converter)
		: undefined;

	return {
		description,
		content: {
			[contentType]: {
				...(openApiSchema ? { schema: openApiSchema } : {}),
			},
		},
	};
};

const createStreamWireSchema = (contentType: string) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/octet-stream"
		? { type: "string", format: "binary" }
		: { type: "string" };

export const createResponses = (
	route: OpenApiRouteDeclaration,
	converter: SchemaConverter,
) => {
	const responses: Record<string, OpenApiResponse> = {};

	for (const [status, schema] of Object.entries(getRouteResponses(route))) {
		responses[status] = createResponse(
			route.openApi?.responseDescriptions?.[Number(status)] ?? "",
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
		...createParameters(
			route.pathParams,
			"path",
			options.schemaConverter,
			route.path,
		),
		...createParameters(route.query, "query", options.schemaConverter),
		...createHeaderParameters(route.headers, options.schemaConverter),
	];
	const requestBody = createRequestBody(route.body, options.schemaConverter);
	const { extensions, ...openApi } = route.openApi ?? {};
	const operation: OpenApiOperation = {
		...openApi,
		...extensions,
		...(parameters.length > 0 ? { parameters } : {}),
		...(requestBody ? { requestBody } : {}),
		responses: createResponses(route, options.schemaConverter),
	};

	return options.transformOperation?.({ route, operation }) ?? operation;
};
