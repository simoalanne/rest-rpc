import type { HttpRouteDeclaration } from "../contract/route.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";

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

export type SchemaIo = "input" | "output";

export type SchemaConversionContext = {
	io: SchemaIo;
};

export type SchemaConverter = (
	schema: StandardSchemaV1,
	context: SchemaConversionContext,
) => OpenApiSchema;

export type OpenApiRouteDeclaration = HttpRouteDeclaration;

export type OperationTransformContext = {
	route: OpenApiRouteDeclaration;
	operation: OpenApiOperation;
};

export type CreateOpenApiDocumentOptions = {
	openapi?: string;
	info: OpenApiDocument["info"];
	servers?: OpenApiDocument["servers"];
	components?: OpenApiDocument["components"];
	tags?: OpenApiDocument["tags"];
	schemaConverter: SchemaConverter;
	transformOperation?: (context: OperationTransformContext) => OpenApiOperation;
	transformDocument?: (document: OpenApiDocument) => OpenApiDocument;
};
