import type {
	Contract,
	HttpRouteDeclaration,
	RequestBodySchema,
	ResponseBodySchema,
	RouteDeclaration,
} from "./contract/route.ts";
import {
	isCustomBody,
	isNoBodyResponse,
	isStreamResponse,
} from "./contract/route.ts";
import { contractRoutes } from "./contract/traversal.ts";
import type { StandardSchemaV1 } from "./standardSchema.ts";

export type OpenApiSchema = Record<string, unknown>;

export type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header" | "cookie";
	required?: boolean;
	description?: string;
	schema?: OpenApiSchema;
};

export type OpenApiRequestBody = {
	required?: boolean;
	description?: string;
	content: Record<string, { schema: OpenApiSchema }>;
};

export type OpenApiResponse = {
	description: string;
	content?: Record<string, { schema: OpenApiSchema }>;
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
	[key: `x-${string}`]: unknown;
};

export type OpenApiPathItem = Partial<
	Record<"get" | "post" | "put" | "delete" | "patch", OpenApiOperation>
>;

export type OpenApiDocument = {
	openapi: string;
	info: {
		title: string;
		version: string;
		description?: string;
	};
	servers?: Array<{ url: string; description?: string }>;
	paths: Record<string, OpenApiPathItem>;
	components?: Record<string, unknown>;
	tags?: Array<{ name: string; description?: string }>;
	[key: `x-${string}`]: unknown;
};

type SchemaIo = "input" | "output";

type SchemaConversionContext = {
	io: SchemaIo;
};

type SchemaConverter = (
	schema: StandardSchemaV1,
	context: SchemaConversionContext,
) => OpenApiSchema;

type OperationTransformContext = {
	route: OpenApiRouteDeclaration;
	operation: OpenApiOperation;
};

type OpenApiRouteDeclaration = HttpRouteDeclaration;

export type CreateOpenApiDocumentOptions = {
	openapi?: string;
	info: OpenApiDocument["info"];
	servers?: OpenApiDocument["servers"];
	components?: OpenApiDocument["components"];
	tags?: OpenApiDocument["tags"];
	schemaConverter?: SchemaConverter;
	transformOperation?: (context: OperationTransformContext) => OpenApiOperation;
	transformDocument?: (document: OpenApiDocument) => OpenApiDocument;
};

const JSON_CONTENT_TYPE = "application/json";

const isOpenApiContract = (
	route: RouteDeclaration,
): route is OpenApiRouteDeclaration =>
	(!route.options || route.options.mode === "http") &&
	route.responses !== undefined &&
	!Object.values(route.responses).some((response) =>
		isStreamResponse(response),
	);

const toOpenApiPath = (path: string) =>
	path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const getSchemaProperties = (schema: OpenApiSchema) =>
	(schema.properties ?? {}) as Record<string, OpenApiSchema>;

const getRequiredSchemaKeys = (schema: OpenApiSchema) =>
	new Set(Array.isArray(schema.required) ? schema.required : []);

const convertSchema = (
	schema: StandardSchemaV1,
	io: SchemaIo,
	converter: SchemaConverter | undefined,
): OpenApiSchema => {
	if (!converter) {
		throw new Error(
			"createOpenApiDocument() requires a schemaConverter option to emit schemas from Standard Schema contracts.",
		);
	}

	return converter(schema, { io });
};

const createParameters = (
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

const createRequestBody = (
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

const createJsonResponse = (
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

const createResponses = (
	route: OpenApiRouteDeclaration,
	converter: SchemaConverter | undefined,
) => {
	const responses: Record<string, OpenApiResponse> = {};

	for (const [status, schema] of Object.entries(route.responses)) {
		responses[status] = createJsonResponse(
			Number(status) >= 200 && Number(status) < 300 ? "Success" : "Error",
			schema,
			converter,
		);
	}

	return responses;
};

const createOperation = (
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

export const createOpenApiDocument = (
	contract: Contract,
	options: CreateOpenApiDocumentOptions,
): OpenApiDocument => {
	const document: OpenApiDocument = {
		openapi: options.openapi ?? "3.1.0",
		info: options.info,
		...(options.servers ? { servers: options.servers } : {}),
		...(options.components ? { components: options.components } : {}),
		...(options.tags ? { tags: options.tags } : {}),
		paths: {},
	};

	for (const route of contractRoutes(contract)) {
		if (!isOpenApiContract(route)) continue;

		const path = toOpenApiPath(route.path);
		const method = route.method.toLowerCase() as keyof OpenApiPathItem;
		document.paths[path] ??= {};
		document.paths[path][method] = createOperation(route, options);
	}

	return options.transformDocument?.(document) ?? document;
};
