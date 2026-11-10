import type {
	DefaultMeta,
	RequestBodyDefinition,
	RouteDefinition,
} from "../contract/routeDefinition.ts";
import type {
	ResponseDefinition,
	ResponseHeadersSchema,
} from "../contract/response.ts";
import type { RouteErrorDefinition } from "../contract/routeError.ts";
import type { StandardSchemaV1 } from "../standard-schema/index.ts";
import { getPathParamNames } from "../contract/path.ts";

type OpenApiSchema = Record<string, unknown>;

type OpenApiParameter = {
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

export type OperationTransformContext = {
	/** The route, with `meta` typed by `DefaultMeta`. */
	route: Omit<RouteDefinition, "meta"> & { meta?: Partial<DefaultMeta> };
	routePath: readonly string[];
	operation: OpenApiOperation;
};

type CreateOperationOptions = {
	schemaConverter?: SchemaConverter;
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

const mapContent = <TValue>(
	content: Readonly<Record<string, TValue>>,
	toSchema: (value: TValue) => OpenApiSchema,
) =>
	Object.fromEntries(
		Object.entries(content).map(([mediaType, value]) => [
			mediaType,
			{ schema: toSchema(value) },
		]),
	);

const createParameters = (
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
		const required = Array.isArray(jsonSchema.required)
			? jsonSchema.required
			: [];
		for (const name of required) requiredKeys.add(name);
	}

	return Object.entries(properties).map(([name, propertySchema]) => {
		return {
			name,
			in: location,
			required: location === "path" || requiredKeys.has(name),
			schema: propertySchema,
		};
	});
};

// Dynamic path segments without a params schema are received as strings.
const createPathParameters = (
	route: RouteDefinition & { path: string },
	options: CreateOperationOptions,
): OpenApiParameter[] =>
	route.request?.params?.length
		? createParameters(route.request.params, "path", options)
		: getPathParamNames(route.path).map((name) => ({
				name,
				in: "path",
				required: true,
				schema: { type: "string" },
			}));

const createRequestBody = (
	body: RequestBodyDefinition | undefined,
	converter: SchemaConverter | undefined,
): OpenApiRequestBody | undefined => {
	if (!body) return undefined;

	return {
		content: mapContent(body, (schemas) => {
			const convertedSchemas = schemas.map(
				(schema) => converter?.(schema, "input") ?? {},
			);
			return convertedSchemas.length === 1
				? convertedSchemas[0]!
				: { allOf: convertedSchemas };
		}),
	};
};

const createResponse = (
	responseDefinition: ResponseDefinition,
	converter: SchemaConverter | undefined,
): OpenApiResponse => {
	const { content } = responseDefinition;
	const headers = createResponseHeaders(responseDefinition.headers, converter);
	const response: OpenApiResponse = {
		description: responseDefinition.description ?? "",
		...(headers ? { headers } : {}),
	};
	if (content === undefined) return response;

	return {
		...response,
		content: mapContent(
			content,
			(schema) => converter?.(schema, "output") ?? {},
		),
	};
};

const createResponseHeaders = (
	headers: ResponseHeadersSchema | undefined,
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

const createErrorBodySchema = (
	code: string,
	definition: RouteErrorDefinition,
	converter: SchemaConverter | undefined,
): OpenApiSchema => ({
	type: "object",
	properties: {
		code: { const: code },
		message: { type: "string" },
		...(definition.data && {
			data: converter?.(definition.data, "output") ?? {},
		}),
	},
	required: definition.data ? ["code", "message", "data"] : ["code", "message"],
});

// Errors sharing a status are documented as one response.
const createErrorResponses = (
	errors: Readonly<Record<string, RouteErrorDefinition>>,
	converter: SchemaConverter | undefined,
) => {
	const byStatus = new Map<number, [string, RouteErrorDefinition][]>();
	for (const [code, definition] of Object.entries(errors)) {
		const group = byStatus.get(definition.status) ?? [];
		group.push([code, definition]);
		byStatus.set(definition.status, group);
	}

	const responses: Record<string, OpenApiResponse> = {};
	for (const [status, group] of byStatus) {
		const schemas = group.map(([code, definition]) =>
			createErrorBodySchema(code, definition, converter),
		);
		const headers = Object.assign(
			{},
			...group.map(([, definition]) =>
				createResponseHeaders(definition.headers, converter),
			),
		);
		responses[status] = {
			description: group
				.flatMap(([, definition]) => definition.description ?? [])
				.join("\n"),
			...(Object.keys(headers).length > 0 ? { headers } : {}),
			content: {
				"application/json": {
					schema: schemas.length === 1 ? schemas[0] : { oneOf: schemas },
				},
			},
		};
	}
	return responses;
};

const createResponses = (
	route: RouteDefinition,
	converter: SchemaConverter | undefined,
) => {
	const defined = Object.entries(route.responses);
	const errors = createErrorResponses(route.errors ?? {}, converter);
	// Responses inferred from a handler have no schema. `default` documents them
	// without claiming a status, and keeps the required Responses Object non-empty.
	if (defined.length === 0) {
		return {
			default: {
				description:
					"Response inferred from the route handler; not documented.",
			},
			...errors,
		};
	}

	const responses: Record<string, OpenApiResponse> = {};
	for (const [status, schema] of defined) {
		responses[status] = createResponse(schema, converter);
	}

	return { ...responses, ...errors };
};

export const createOperation = (
	route: RouteDefinition & { path: string },
	options: CreateOperationOptions,
	routePath: readonly string[],
): OpenApiOperation => {
	const { request } = route;
	const parameters = [
		...createPathParameters(route, options),
		...createParameters(request?.query, "query", options),
		...createParameters(request?.headers, "header", options),
	];
	const requestBody = createRequestBody(request?.body, options.schemaConverter);
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
