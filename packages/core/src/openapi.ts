import type {
	ContractTree,
	FlattenedContract,
	JsonContract,
	ResponseBodySchema,
} from "./contracts.ts";
import {
	flattenContractTree,
	isNoBodyResponse,
	isStreamResponse,
} from "./contracts.ts";
import z from "zod";

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

type SchemaConversionOptions = {
	unrepresentable?: "throw" | "any";
	reused?: "ref" | "inline";
};

type OperationTransformContext<TMeta> = {
	contract: OpenApiContract<TMeta>;
	operation: OpenApiOperation;
};

type OpenApiContract<TMeta> = JsonContract<TMeta> & {
	keySegments: string[];
};

export type CreateOpenApiDocumentOptions<TMeta = unknown> = {
	openapi?: string;
	info: OpenApiDocument["info"];
	servers?: OpenApiDocument["servers"];
	components?: OpenApiDocument["components"];
	tags?: OpenApiDocument["tags"];
	schema?: SchemaConversionOptions;
	transformOperation?: (
		context: OperationTransformContext<TMeta>,
	) => OpenApiOperation;
	transformDocument?: (document: OpenApiDocument) => OpenApiDocument;
};

const JSON_CONTENT_TYPE = "application/json";

const isOpenApiContract = <TMeta>(
	contract: FlattenedContract<TMeta>,
): contract is OpenApiContract<TMeta> =>
	(!contract.options || contract.options.mode === "json") &&
	"responses" in contract &&
	!Object.values(contract.responses).some((response) =>
		isStreamResponse(response),
	);

const toOpenApiPath = (path: string) =>
	path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const getSchemaProperties = (schema: OpenApiSchema) =>
	(schema.properties ?? {}) as Record<string, OpenApiSchema>;

const getRequiredSchemaKeys = (schema: OpenApiSchema) =>
	new Set(Array.isArray(schema.required) ? schema.required : []);

const toJsonSchema = (
	schema: z.ZodType,
	io: "input" | "output",
	options: SchemaConversionOptions | undefined,
): OpenApiSchema =>
	z.toJSONSchema(schema, {
		target: "openapi-3.0",
		io,
		unrepresentable: options?.unrepresentable ?? "throw",
		reused: options?.reused ?? "inline",
	}) as OpenApiSchema;

const createParameters = (
	schema: z.ZodObject | undefined,
	location: "path" | "query",
	options: SchemaConversionOptions | undefined,
): OpenApiParameter[] => {
	if (!schema) return [];

	const jsonSchema = toJsonSchema(schema, "input", options);
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
	schema: z.ZodType | undefined,
	options: SchemaConversionOptions | undefined,
): OpenApiRequestBody | undefined => {
	if (!schema) return undefined;

	return {
		required: true,
		content: {
			[JSON_CONTENT_TYPE]: {
				schema: toJsonSchema(schema, "input", options),
			},
		},
	};
};

const createJsonResponse = (
	description: string,
	schema: ResponseBodySchema,
	options: SchemaConversionOptions | undefined,
): OpenApiResponse => {
	if (isNoBodyResponse(schema)) return { description };

	return {
		description,
		content: {
			[JSON_CONTENT_TYPE]: {
				schema: toJsonSchema(schema as z.ZodType, "output", options),
			},
		},
	};
};

const createResponses = (
	contract: JsonContract,
	options: SchemaConversionOptions | undefined,
) => {
	const responses: Record<string, OpenApiResponse> = {};

	for (const [status, schema] of Object.entries(contract.responses)) {
		responses[status] = createJsonResponse(
			Number(status) >= 200 && Number(status) < 300 ? "Success" : "Error",
			schema,
			options,
		);
	}

	return responses;
};

const createOperation = <TMeta>(
	contract: OpenApiContract<TMeta>,
	options: CreateOpenApiDocumentOptions<TMeta>,
): OpenApiOperation => {
	const parameters = [
		...createParameters(contract.request?.params, "path", options.schema),
		...createParameters(contract.request?.query, "query", options.schema),
	];
	const requestBody = createRequestBody(contract.request?.body, options.schema);
	const operation: OpenApiOperation = {
		...(parameters.length > 0 ? { parameters } : {}),
		...(requestBody ? { requestBody } : {}),
		responses: createResponses(contract, options.schema),
	};

	return options.transformOperation?.({ contract, operation }) ?? operation;
};

export const createOpenApiDocument = <TMeta = unknown>(
	contracts: ContractTree<TMeta>,
	options: CreateOpenApiDocumentOptions<TMeta>,
): OpenApiDocument => {
	const document: OpenApiDocument = {
		openapi: options.openapi ?? "3.1.0",
		info: options.info,
		...(options.servers ? { servers: options.servers } : {}),
		...(options.components ? { components: options.components } : {}),
		...(options.tags ? { tags: options.tags } : {}),
		paths: {},
	};

	for (const contract of flattenContractTree<TMeta>(contracts)) {
		if (!isOpenApiContract(contract)) continue;

		const path = toOpenApiPath(contract.path);
		const method = contract.method.toLowerCase() as keyof OpenApiPathItem;
		document.paths[path] ??= {};
		document.paths[path][method] = createOperation(contract, options);
	}

	return options.transformDocument?.(document) ?? document;
};
